import './helpers/obscura-data-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openObscuraBrowser } from '../src/obscura-engine/open-obscura-browser.mjs';
import { resolveObscuraBinary } from '../src/obscura-engine/resolve-obscura-binary.mjs';

let available = true;
try { resolveObscuraBinary(); } catch { available = false; }

/**
 * Dựng origin offline riêng, không truy cập offer hay dùng dữ liệu thật.
 * @param {import('node:test').TestContext} t Bộ quản lý tài nguyên.
 * @return {Promise<string>} Origin của fixture.
 * @throws {Error} Khi tạo hoặc bind HTTP server loopback thất bại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function fixture(t) {
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><html><body>Permission fixture</body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

/**
 * Đọc tọa độ hoặc mã lỗi từ chính realm được chọn, không dùng giá trị cache của trang cha.
 * @param {import('playwright').Page|import('playwright').Frame} realm Trang hoặc iframe fixture.
 * @return {Promise<Array<number>|number>} Latitude, longitude, accuracy hoặc mã lỗi vị trí.
 * @throws {Error} Khi CDP lỗi hoặc callback native không hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function positionResult(realm) {
  return realm.evaluate(() => new Promise(resolve => navigator.geolocation.getCurrentPosition(
    position => resolve([position.coords.latitude, position.coords.longitude, position.coords.accuracy]),
    error => resolve(error.code), { timeout: 3000 },
  )));
}

/**
 * Kiểm tra policy native qua CDP, nhiều realm, context và document mới.
 * @param {import('node:test').TestContext} t Tài nguyên test.
 * @return {Promise<void>} Hoàn tất các kiểm tra quyền.
 * @throws {Error} Khi khởi tạo, CDP hoặc assertion thất bại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
test('Obscura quản lý grant/deny/reset quyền theo origin và BrowserContext trong Rust', { skip: !available, timeout: 45000 }, async t => {
  const origin = await fixture(t);
  const otherOrigin = await fixture(t);
  const inheritedGeolocation = process.env.OBSCURA_GEOLOCATION;
  let session;
  delete process.env.OBSCURA_GEOLOCATION;
  try {
    session = await openObscuraBrowser({ slot: 986, port: 0, seed: 4242, registerSession: false });
  } finally {
    if (inheritedGeolocation === undefined) delete process.env.OBSCURA_GEOLOCATION;
    else process.env.OBSCURA_GEOLOCATION = inheritedGeolocation;
  }
  t.after(() => session.close());
  const page = session.page;
  await page.goto(origin);
  const cdp = await session._cdpBrowser.newBrowserCDPSession();
  const pageCdp = await session.context.newCDPSession(page);
  await pageCdp.send('Emulation.setGeolocationOverride', { latitude: 10, longitude: 20, accuracy: 100 });
  assert.equal(await page.evaluate(async () => (await navigator.permissions.query({ name: 'geolocation' })).state), 'prompt');
  assert.equal(await positionResult(page), 1, 'Override không được tự grant hoặc tiết lộ tọa độ khi prompt');
  await page.evaluate(async () => {
    window.permissionEvents = [];
    window.permissionOnChange = 0;
    window.permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
    permissionStatus.addEventListener('change', () => {
      permissionEvents.push(permissionStatus.state);
    });
    permissionStatus.onchange = () => { permissionOnChange++; };
  });
  assert.deepEqual(await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, '__obscura_poll_permissions');
    let assignmentError = false;
    try { globalThis.__obscura_poll_permissions = () => {}; } catch { assignmentError = true; }
    return [descriptor?.writable, descriptor?.enumerable, descriptor?.configurable, assignmentError];
  }), [false, false, false, false]);
  await assert.rejects(cdp.send('Browser.grantPermissions', { origin, permissions: ['geolocation', 'unsupported-permission'] }), /Unsupported permission/);
  assert.equal(await page.evaluate(() => permissionStatus.state), 'prompt');
  const firstPermissionChange = page.waitForFunction(() => permissionEvents.length === 1, null, { timeout: 3000 });
  await cdp.send('Browser.grantPermissions', { origin, permissions: ['geolocation', 'notifications'] });
  await firstPermissionChange;
  assert.deepEqual(await page.evaluate(() => [permissionStatus.name, permissionStatus.state, ...permissionEvents, Notification.permission]),
    ['geolocation', 'granted', 'granted', 'granted']);
  assert.equal(await page.evaluate(() => permissionOnChange), 1);
  assert.deepEqual(await positionResult(page), [10, 20, 100]);
  const frameNavigation = page.waitForEvent('framenavigated', { predicate: frame => frame.url().startsWith(otherOrigin), timeout: 5000 });
  await page.evaluate(origin => {
    const frame = document.createElement('iframe');
    frame.src = origin;
    document.body.appendChild(frame);
  }, otherOrigin);
  const foreign = await frameNavigation;
  assert.ok(foreign, 'Phải có realm khác origin');
  assert.equal(await foreign.evaluate(async () => (await navigator.permissions.query({ name: 'geolocation' })).state), 'prompt');
  assert.equal(await positionResult(foreign), 1, 'Grant của trang cha không được cấp quyền cho origin iframe');
  await cdp.send('Browser.setPermission', { origin: otherOrigin, permission: { name: 'geolocation' }, setting: 'granted' });
  assert.deepEqual(await positionResult(foreign), [10, 20, 100]);
  const sameOriginPage = await session.context.newPage();
  await sameOriginPage.goto(origin);
  assert.equal(await sameOriginPage.evaluate(async () => (await navigator.permissions.query({ name: 'geolocation' })).state), 'granted');
  assert.equal(await positionResult(sameOriginPage), 2, 'Override phải thuộc đúng page, không tràn sang page cùng context');
  const isolated = await session._cdpBrowser.newContext();
  const isolatedPage = await isolated.newPage();
  await isolatedPage.goto(origin);
  assert.equal(await isolatedPage.evaluate(async () => (await navigator.permissions.query({ name: 'geolocation' })).state), 'prompt');
  const isolatedCdp = await isolated.newCDPSession(isolatedPage);
  await isolatedCdp.send('Emulation.setGeolocationOverride', { latitude: 30, longitude: 40, accuracy: 2.5 });
  assert.equal(await positionResult(isolatedPage), 1, 'Context độc lập phải có grant riêng');
  await isolated.grantPermissions(['geolocation'], { origin });
  assert.deepEqual(await positionResult(isolatedPage), [30, 40, 2.5]);
  await cdp.send('Browser.setPermission', { origin, permission: { name: 'geolocation' }, setting: 'denied' });
  await page.waitForFunction(() => permissionEvents.length === 2, null, { timeout: 3000 });
  assert.deepEqual(await page.evaluate(() => permissionEvents), ['granted', 'denied']);
  await pageCdp.send('Emulation.setGeolocationOverride', { latitude: 10, longitude: 20, accuracy: 100 });
  assert.equal(await page.evaluate(() => permissionStatus.state), 'denied');
  assert.equal(await positionResult(page), 1);
  await assert.rejects(cdp.send('Browser.setPermission', { origin, permission: { name: 'geolocation' }, setting: 'invalid' }), /Unsupported permission or setting/);
  await assert.rejects(cdp.send('Browser.grantPermissions', { browserContextId: 'missing-context', permissions: [] }), /Unknown browser context/);
  assert.equal(await page.evaluate(() => permissionStatus.state), 'denied');
  await cdp.send('Browser.resetPermissions', {});
  await page.waitForFunction(() => permissionEvents.length === 3, null, { timeout: 3000 });
  assert.deepEqual(await page.evaluate(() => permissionEvents), ['granted', 'denied', 'prompt']);
  assert.equal(await page.evaluate(() => permissionOnChange), 3);
  assert.equal(await positionResult(page), 1, 'Reset về prompt phải chặn tọa độ cũ');
  assert.equal(await positionResult(foreign), 1, 'Reset cũng thu hồi grant của iframe');
  assert.equal(await isolatedPage.evaluate(async () => (await navigator.permissions.query({ name: 'geolocation' })).state), 'granted');
  assert.deepEqual(await positionResult(isolatedPage), [30, 40, 2.5]);
  await isolatedCdp.detach();
  await isolated.close();
  await cdp.send('Browser.setPermission', { origin, permission: { name: 'notifications' }, setting: 'granted' });
  await page.reload();
  assert.deepEqual(await page.evaluate(async () => [(await navigator.permissions.query({ name: 'notifications' })).state, Notification.permission]), ['granted', 'granted']);
  assert.equal(await positionResult(page), 1, 'Reload không được biến prompt thành grant');
  await pageCdp.detach();
});
