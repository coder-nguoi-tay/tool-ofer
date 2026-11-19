import './helpers/obscura-data-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openObscuraBrowser } from '../src/obscura-engine/open-obscura-browser.mjs';
import { resolveObscuraBinary } from '../src/obscura-engine/resolve-obscura-binary.mjs';

let available = true;
try { resolveObscuraBinary(); } catch { available = false; }

/**
 * Tạo origin loopback và đăng ký dọn socket của fixture.
 * @param {import('node:test').TestContext} t Bộ quản lý tài nguyên test.
 * @return {Promise<string>} Origin chứa trang không dùng tài nguyên bên ngoài.
 * @throws {Error} Khi không mở được HTTP server thử nghiệm.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function createOrigin(t) {
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><title>Permission validation fixture</title>');
  });
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

/**
 * Đọc hai quyền đã có backend policy từ đúng realm của page.
 * @param {import('playwright').Page} page Trang fixture cần kiểm tra.
 * @return {Promise<string[]>} Trạng thái geolocation và notifications.
 * @throws {Error} Khi page đóng hoặc Permissions API không trả kết quả.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function readStates(page) {
  return page.evaluate(async () => Promise.all(['geolocation', 'notifications'].map(
    async name => (await navigator.permissions.query({ name })).state)));
}

/**
 * Đăng ký cleanup trước khi đợi engine để thu hồi cả phiên khởi động muộn.
 * @param {import('node:test').TestContext} t Bộ quản lý tài nguyên test.
 * @param {number} slot Slot riêng của fixture.
 * @return {Promise<object>} Phiên đã kết nối CDP và thuộc cleanup của test.
 * @throws {Error} Khi engine khởi động lỗi hoặc test đã bị hủy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function openFixture(t, slot) {
  const startup = openObscuraBrowser({ slot, port: 0, seed: 4242, registerSession: false });
  t.after(async () => {
    const session = await startup.catch(() => null);
    if (session) await session.close();
  });
  const session = await startup;
  t.signal.throwIfAborted();
  return session;
}

/**
 * Bắt lỗi tham số CDP mà không cho phép ghi dở hoặc mở rộng phạm vi policy.
 * @param {import('node:test').TestContext} t Bộ quản lý tài nguyên test.
 * @return {Promise<void>} Hoàn tất ma trận lỗi và kiểm tra tính nguyên tử.
 * @throws {Error} Khi tham số sai được chấp nhận hoặc policy bị thay đổi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
test('Obscura từ chối tham số quyền CDP sai mà không đổi policy của origin/context', { skip: !available, timeout: 60000 }, async t => {
  const origin = await createOrigin(t);
  const otherOrigin = await createOrigin(t);
  const session = await openFixture(t, 984);
  const page = session.page;
  await page.goto(origin);
  const otherPage = await session.context.newPage();
  await otherPage.goto(otherOrigin);
  const isolated = await session._cdpBrowser.newContext();
  const isolatedPage = await isolated.newPage();
  await isolatedPage.goto(origin);
  await isolated.grantPermissions(['geolocation'], { origin });
  const cdp = await session._cdpBrowser.newBrowserCDPSession();
  await cdp.send('Browser.setPermission', { origin, permission: { name: 'geolocation' }, setting: 'denied' });
  await cdp.send('Browser.setPermission', { origin, permission: { name: 'notifications' }, setting: 'granted' });
  const setGeolocation = { origin, permission: { name: 'geolocation' }, setting: 'granted' };
  const invalidRequests = [
    ['Browser.setPermission', { ...setGeolocation, origin: 42 }, /origin must be a string/],
    ['Browser.setPermission', { ...setGeolocation, browserContextId: 42 }, /browserContextId must be a string/],
    ['Browser.setPermission', { ...setGeolocation, browserContextId: 'missing-context' }, /Unknown browser context/],
    ['Browser.setPermission', { ...setGeolocation, setting: 'invalid' }, /Unsupported permission or setting/],
    ['Browser.setPermission', { ...setGeolocation, embeddedOrigin: otherOrigin }, /embeddedOrigin.*not supported/],
    ['Browser.setPermission', { ...setGeolocation, permission: { name: 'camera', panTiltZoom: true } }, /Extended permission descriptors/],
    ['Browser.grantPermissions', { origin, permissions: ['geolocation', 'unsupported-permission'] }, /Unsupported permission/],
    ['Browser.resetPermissions', { browserContextId: 42 }, /browserContextId must be a string/],
  ];
  for (const [method, params, expectedError] of invalidRequests) {
    await assert.rejects(cdp.send(method, params), expectedError);
    assert.deepEqual(await readStates(page), ['denied', 'granted'], method);
    assert.deepEqual(await readStates(otherPage), ['prompt', 'prompt'], `${method}: origin khác`);
    assert.deepEqual(await readStates(isolatedPage), ['granted', 'denied'], `${method}: context khác`);
  }
  await isolated.close();
});

/**
 * Kiểm tra wildcard, override từng origin và reset chỉ tác động context đích.
 * @param {import('node:test').TestContext} t Bộ quản lý tài nguyên test.
 * @return {Promise<void>} Hoàn tất kiểm tra phạm vi policy.
 * @throws {Error} Khi wildcard hoặc reset làm sai trạng thái của context khác.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
test('Obscura áp dụng wildcard quyền, ưu tiên origin và reset đúng BrowserContext', { skip: !available, timeout: 60000 }, async t => {
  const origin = await createOrigin(t);
  const otherOrigin = await createOrigin(t);
  const session = await openFixture(t, 983);
  const page = session.page;
  await page.goto(origin);
  const otherPage = await session.context.newPage();
  await otherPage.goto(otherOrigin);
  const cdp = await session._cdpBrowser.newBrowserCDPSession();
  await cdp.send('Browser.setPermission', { permission: { name: 'geolocation' }, setting: 'granted' });
  await cdp.send('Browser.setPermission', { permission: { name: 'notifications' }, setting: 'denied' });
  assert.deepEqual(await readStates(page), ['granted', 'denied']);
  assert.deepEqual(await readStates(otherPage), ['granted', 'denied']);
  await cdp.send('Browser.setPermission', { origin, permission: { name: 'geolocation' }, setting: 'denied' });
  await cdp.send('Browser.setPermission', { origin, permission: { name: 'notifications' }, setting: 'granted' });
  assert.deepEqual(await readStates(page), ['denied', 'granted']);
  assert.deepEqual(await readStates(otherPage), ['granted', 'denied']);
  await cdp.send('Browser.grantPermissions', { origin, permissions: ['geolocation'] });
  assert.deepEqual(await readStates(page), ['granted', 'denied']);
  const isolated = await session._cdpBrowser.newContext();
  const isolatedPage = await isolated.newPage();
  await isolatedPage.goto(origin);
  assert.deepEqual(await readStates(isolatedPage), ['prompt', 'prompt']);
  await isolated.grantPermissions(['notifications'], { origin });
  await cdp.send('Browser.resetPermissions');
  assert.deepEqual(await readStates(page), ['prompt', 'prompt']);
  assert.deepEqual(await readStates(otherPage), ['prompt', 'prompt']);
  assert.deepEqual(await readStates(isolatedPage), ['denied', 'granted']);
  await isolated.clearPermissions();
  assert.deepEqual(await readStates(isolatedPage), ['prompt', 'prompt']);
  await isolated.close();
});

/**
 * Chờ sự kiện từ page, không kích thích runtime bằng evaluate hoặc waitForFunction.
 * @param {import('node:test').TestContext} t Bộ quản lý tài nguyên test.
 * @return {Promise<void>} Nhận được thông báo thay đổi policy qua CDP console.
 * @throws {Error} Khi runtime không phát change nếu client không poll.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
test('Obscura tự phát PermissionStatus.change khi client không poll page', { skip: !available, timeout: 60000 }, async t => {
  const origin = await createOrigin(t);
  const session = await openFixture(t, 982);
  const page = session.page;
  await page.goto(origin);
  await page.evaluate(async () => {
    window.permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
    permissionStatus.addEventListener('change', () => console.log(`native-permission:${permissionStatus.state}`));
  });
  const cdp = await session._cdpBrowser.newBrowserCDPSession();
  const notification = page.waitForEvent('console', {
    predicate: message => message.text() === 'native-permission:granted', timeout: 3000,
  });
  await Promise.all([
    notification,
    cdp.send('Browser.setPermission', { origin, permission: { name: 'geolocation' }, setting: 'granted' }),
  ]);
});
