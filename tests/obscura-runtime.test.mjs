import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { runInNewContext } from 'node:vm';
import { mkdir, readFile, rm } from 'node:fs/promises';

process.env.AUTOLEADPC_LOG_MODE = 'access';
process.env.AUTOLEADPC_DATA_DIR = `AutoLeadPC-tests-obscura-runtime-${process.pid}`;
const { openObscuraBrowser } = await import('../src/obscura-engine/open-obscura-browser.mjs');
const { resolveObscuraBinary } = await import('../src/obscura-engine/resolve-obscura-binary.mjs');
const { activeBrowsers } = await import('../src/browser/sessions.mjs');
const { appDataDirectory } = await import('../src/config/paths.mjs');
let hasNativeBinary = true;
try { resolveObscuraBinary(); } catch { hasNativeBinary = false; }

/**
 * Dựng offer và iframe local, giữ HTTP header để kiểm chứng danh tính thực gửi lên server.
 * @return {Promise<object>} Server, URL và danh sách request fixture.
 * @throws {Error} Khi không bind được loopback.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
async function createFixture() {
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push({ url: request.url, headers: request.headers });
    response.setHeader('Content-Type', 'text/html');
    response.end(request.url === '/nested'
      ? '<html><body><input id="nested"><button id="nestedButton" onclick="window.nestedClicks=(window.nestedClicks||0)+1">Nested</button></body></html>'
      : request.url === '/frame'
        ? '<html><body><input id="inside"><button id="insideButton" onclick="window.clicks=(window.clicks||0)+1">Inside</button><iframe src="/nested" style="height:120px"></iframe></body></html>'
        : '<html><body><input id="outside"><iframe src="/frame" style="height:450px"></iframe></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, requests, url: `http://127.0.0.1:${server.address().port}/` };
}

test('Obscura thực thi input/HTTP/vòng đời qua CDP thật, không giả lập bằng gán DOM', { skip: !hasNativeBinary, timeout: 30000 }, async t => {
  const fixture = await createFixture();
  let session;
  t.after(async () => { await session?.close(); await new Promise(resolve => fixture.server.close(resolve)); });
  session = await openObscuraBrowser({ slot: 987, port: 0, seed: 981, os: 'android',
    geo: { country: 'US', timezone: 'America/New_York' }, targetUrl: fixture.url });
  session.page.setDefaultTimeout(2000);
  await t.test('fill và click iframe thay đổi đúng document, không nhập vào cha', async () => {
    const frame = session.page.frameLocator('iframe');
    await frame.locator('#inside').fill('IFRAME');
    assert.equal(await frame.locator('#inside').inputValue(), 'IFRAME');
    await frame.locator('#insideButton').click();
    assert.equal(await session.page.frames()[1].evaluate(() => window.clicks), 1);
    await session.page.locator('#outside').fill('MAIN');
    assert.equal(await session.page.locator('#outside').inputValue(), 'MAIN');
    assert.equal(await frame.locator('#inside').inputValue(), 'IFRAME');
  });
  await t.test('input và click iframe lồng nhau dùng đúng frame owner', async () => {
    const nested = session.page.frameLocator('iframe').frameLocator('iframe');
    await nested.locator('#nested').fill('NESTED');
    assert.equal(await nested.locator('#nested').inputValue(), 'NESTED');
    await nested.locator('#nestedButton').click();
    const nestedFrame = session.page.frames().find(frame => frame.url().endsWith('/nested'));
    assert.equal(await nestedFrame.evaluate(() => window.nestedClicks), 1);
  });
  await t.test('header tài liệu và iframe khớp JS/profile; timezone áp dụng trong engine', async () => {
    const actual = await session.page.evaluate(() => ({ ua: navigator.userAgent, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
    assert.equal(actual.ua, session.profile.user_agent);
    assert.equal(actual.timezone, 'America/New_York');
    assert.ok(fixture.requests.some(request => request.url === '/frame'));
    for (const request of fixture.requests) {
      assert.equal(request.headers['user-agent'], actual.ua, request.url);
      assert.equal(request.headers['sec-ch-ua-platform'], '"Android"', request.url);
    }
  });
  await t.test('screenshot và số liệu response không âm', async () => {
    const pending = [];
    session.browser.on('requestfinished', request => pending.push(request.sizes()));
    await session.page.goto(fixture.url);
    await Promise.all(pending);
    assert.ok(pending.length > 0);
    for (const result of await Promise.all(pending)) assert.ok(result.responseBodySize >= 0, JSON.stringify(result));
    const screenshot = await session.page.screenshot({ type: 'jpeg', timeout: 2000 });
    assert.equal(screenshot.subarray(0, 3).toString('hex'), 'ffd8ff');
  });
  await t.test('reconnect giữ URL và DOM đang làm trên cùng renderer', async () => {
    await session.page.locator('#outside').fill('KEEP_ON_RECONNECT');
    const previous = session._cdpBrowser;
    await previous.close();
    const deadline = Date.now() + 7000;
    while ((session._cdpBrowser === previous || session.connectionStatus !== 'connected') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(session.connectionStatus, 'connected');
    assert.equal(session.isObscuraProcessAlive(), true);
    assert.equal(await session.page.locator('#outside').inputValue(), 'KEEP_ON_RECONNECT');
  });
  await t.test('đóng context dừng process đúng phiên và đóng lặp chờ cùng promise', async () => {
    await session.browser.close();
    await session.close();
    assert.equal(session.isObscuraProcessAlive(), false);
    assert.equal(activeBrowsers.has(session), false);
    assert.equal(session.close(), session.close());
  });
});

test('bộ cấp phát chung mở Obscura không cần Chrome, giữ offer/setting và dừng khi hết proxy', async t => {
  await mkdir(appDataDirectory, { recursive: true });
  const { launchRequestedBrowsers } = await import('../src/browser/actions/launch-requested-browsers.mjs');
  const { autoRefill } = await import('../src/runtime/constants/auto-refill.mjs');
  const { proxyQueue } = await import('../src/runtime/constants/proxy-queue.mjs');
  const { autofillQueue } = await import('../src/runtime/constants/autofill-queue.mjs');
  const { multiOfferState } = await import('../src/runtime/constants/multi-offer-state.mjs');
  const { activeProxyLocks } = await import('../src/runtime/constants/active-proxy-locks.mjs');
  const { applicationState } = await import('../src/runtime/application-state.mjs');
  t.after(async () => { autoRefill.enabled = false; activeBrowsers.clear(); activeProxyLocks.clear(); await rm(appDataDirectory, { recursive: true, force: true }); });
  Object.assign(autoRefill, { enabled: true, settings: {}, stopRequested: false, noSlotRefill: false });
  proxyQueue.available = []; proxyQueue.used = []; autofillQueue.available = []; autofillQueue.used = [];
  multiOfferState.offerUsed.clear(); multiOfferState.offerCursors.clear();
  applicationState.limitRunMax = 0;
  const calls = [];
  /**
   * Thay riêng engine, giữ nguyên parser/allocator/history của launcher thật.
   * @param {object} options Tài nguyên đã cấp cho engine.
   * @return {Promise<object>} Kết quả tương thích opener.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-17
   */
  const openBrowser = async options => {
    calls.push(options);
    const session = { slot: options.tileIndex + 1, tileIndex: options.tileIndex, isObscura: true, browser: { pages: () => [] }, close: async () => {} };
    activeBrowsers.add(session);
    return { session, finalUrl: options.websiteUrl };
  };
  const settings = { proxyList: '127.0.0.1:1080\n127.0.0.1:1081', proxyType: 'http', requestedCount: 1,
    websiteUrl: 'https://fixture.invalid/one', websiteUrl2: 'https://fixture.invalid/two',
    enableLeadCheck: true, leadCheckInterval: 20, stopAutofillOnLead: true, choiceDelay: 350,
    completeText: 'done', limitRun: 3, offerSolver: 'generic', dataSaver: false };
  await launchRequestedBrowsers(JSON.stringify(settings), { browserEngine: 'obscura', openBrowser, isAutomaticRefill: true, assignedStreamRoles: [2] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].proxy.server, 'http://127.0.0.1:1081');
  assert.equal(calls[0].websiteUrl, settings.websiteUrl2);
  assert.equal(calls[0].leadConfig.intervalSeconds, 20);
  assert.equal(calls[0].leadConfig.stopAutofillOnLead, true);
  assert.equal(calls[0].completeText, 'done');
  assert.equal(calls[0].offerSolver, 'generic');
  autoRefill.noSlotRefill = true;
  await launchRequestedBrowsers(JSON.stringify(settings), { browserEngine: 'obscura', openBrowser, isAutomaticRefill: true });
  assert.equal(calls.length, 1);
  activeBrowsers.clear(); proxyQueue.available = [];
  const empty = await launchRequestedBrowsers(JSON.stringify({ requestedCount: 1, websiteUrl: settings.websiteUrl }), { browserEngine: 'obscura', openBrowser });
  assert.equal(calls.length, 1);
  assert.ok(empty.warnings.length);
});

test('runtime Obscura dùng autofill thật, record riêng và submit form fixture', { skip: !hasNativeBinary, timeout: 25000 }, async t => {
  const { initializeObscuraRuntime } = await import('../src/obscura-engine/initialize-obscura-runtime.mjs');
  const { globalAiConfig } = await import('../src/ai-assist/state/global-ai-config.mjs');
  const { runModeState } = await import('../src/runtime/constants/run-mode-state.mjs');
  globalAiConfig.enabled = false; // Fixture không gọi AI/dịch vụ thật, kể cả khi form chưa tiến triển.
  runModeState.manual = false;
  let submitted;
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    const url = new URL(request.url, 'http://fixture.invalid');
    if (url.pathname === '/result') {
      submitted = Object.fromEntries(url.searchParams);
      response.end('<html><body>Fixture received</body></html>');
    } else response.end('<html><body><form action="/result"><label>First name<input name="firstName" required></label><label>Email<input name="email" type="email" required></label><button type="submit">Continue</button></form></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const session = await openObscuraBrowser({ slot: 988, port: 0, targetUrl: null });
  t.after(async () => { await session.close(); await new Promise(resolve => server.close(resolve)); });
  await session.browser.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
  Object.assign(session, { websiteUrl: url, offerNumber: 1, offerSolver: 'generic', enableLeadCheck: false, dataSaver: false, assignedEmail: 'session@example.invalid' });
  await initializeObscuraRuntime(session, {
    autofillRecords: [{ firstname: 'Fixture', email: 'record@example.invalid' }],
    offerUrls: [url], leadConfig: { enabled: false }, autoSubmit: true,
  });
  const deadline = Date.now() + 18000;
  while (!submitted && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 200));
  assert.ok(submitted, 'Autofill thật phải gửi form, không dùng page.evaluate để gán đáp án');
  assert.equal(submitted.firstName, 'Fixture');
  assert.equal(submitted.email, 'session@example.invalid');
  assert.equal(session.currentRecord.firstname, 'Fixture');
});

test('Stop nhận diện cả process đang chờ CDP, không để startup mở muộn', { skip: !hasNativeBinary, timeout: 20000 }, async () => {
  const { pendingObscuraSessions } = await import('../src/obscura-engine/sessions.mjs');
  const opening = openObscuraBrowser({ slot: 989, port: 0 });
  const rejected = assert.rejects(opening);
  const deadline = Date.now() + 3000;
  while (![...pendingObscuraSessions].some(session => session.slot === 989) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  const starting = [...pendingObscuraSessions].find(session => session.slot === 989);
  assert.ok(starting, 'Child phải được đăng ký trước khi chờ CDP');
  await starting.close();
  await rejected;
  assert.equal([...pendingObscuraSessions].some(session => session.slot === 989), false);
});

test('worker thiếu engine không nhận Obscura; task hỗ trợ giữ engine và cấu hình', async t => {
  await mkdir(appDataDirectory, { recursive: true });
  const { dispatchOneTaskToAgent } = await import('../src/agents/actions/dispatch-one-task-to-agent.mjs');
  const { proxyQueue } = await import('../src/runtime/constants/proxy-queue.mjs');
  const { autofillQueue } = await import('../src/runtime/constants/autofill-queue.mjs');
  const { pendingAgentTasks } = await import('../src/runtime/constants/pending-agent-tasks.mjs');
  proxyQueue.available = ['127.0.0.1:1080', '127.0.0.1:1081']; proxyQueue.used = [];
  autofillQueue.available = [{ firstname: 'Fixture' }]; autofillQueue.used = [];
  pendingAgentTasks.length = 0;
  t.after(async () => { pendingAgentTasks.length = 0; proxyQueue.available = []; await rm(appDataDirectory, { recursive: true, force: true }); });
  const settings = { browserMode: 'Obscura', websiteUrl: 'https://fixture.invalid/', completeText: 'finished',
    stopAutofillOnLead: true, leadCheckInterval: 20, autoCloseNoLead: false, offerSolver: 'generic' };
  const worker = { freeSlots: 2, activeTasks: 0, supportedEngines: ['Chrome'] };
  assert.equal(dispatchOneTaskToAgent(worker, settings), false);
  assert.equal(proxyQueue.available.length, 2);
  worker.supportedEngines.push('Obscura');
  assert.equal(dispatchOneTaskToAgent(worker, settings), true);
  assert.equal(pendingAgentTasks[0].browserMode, 'Obscura');
  assert.equal(pendingAgentTasks[0].completeText, 'finished');
  assert.equal(pendingAgentTasks[0].leadConfig.intervalSeconds, 20);
  assert.equal(pendingAgentTasks[0].leadConfig.autoCloseNoLead, false);
});


test('worker giữ khóa khi native chưa dừng và hủy task đang xếp hàng sau Stop', async t => {
  const { activeProxyLocks } = await import('../src/runtime/constants/active-proxy-locks.mjs');
  const { autoRefill } = await import('../src/runtime/constants/auto-refill.mjs');
  const { applicationState } = await import('../src/runtime/application-state.mjs');
  const moduleUrl = new URL('../src/agents/actions/run-agent-task.mjs', import.meta.url);
  const source = (await readFile(moduleUrl, 'utf8')).replace(/from '([^']+)'/g, (match, specifier) => {
    if (specifier.endsWith('/open-obscura-session.mjs')) {
      const fixture = 'export async function openObscuraSession() { const error = new Error("native still alive"); error.obscuraStopUnconfirmed = true; throw error; }';
      return `from 'data:text/javascript;base64,${Buffer.from(fixture).toString('base64')}'`;
    }
    return `from '${specifier.startsWith('.') ? new URL(specifier, moduleUrl).href : specifier}'`;
  });
  const { runAgentTask } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  t.after(() => { activeProxyLocks.clear(); applicationState.exclusiveQueue = Promise.resolve(); });
  const task = { browserMode: 'Obscura', proxy: '127.0.0.1:1099', websiteUrl: 'https://fixture.invalid/' };
  await assert.rejects(runAgentTask(task), /native still alive/);
  assert.equal(activeProxyLocks.size, 1, 'Không nhả proxy khi engine vẫn có thể đang chạy');
  activeProxyLocks.clear();
  let releaseQueue;
  applicationState.exclusiveQueue = new Promise(resolve => { releaseQueue = resolve; });
  const queued = runAgentTask(task);
  const cancelled = assert.rejects(queued, /đã bị hủy/);
  autoRefill.launchGeneration = (autoRefill.launchGeneration || 0) + 1;
  releaseQueue();
  await cancelled;
  assert.equal(activeProxyLocks.size, 0, 'Task hủy trước khi lấy proxy');
});


test('state và preview giữ Obscura iPhone/iPad thiếu Chrome version, bỏ phiên đã đóng', async t => {
  const { getAutoRefillStatus } = await import('../src/refill/actions/get-auto-refill-status.mjs');
  t.after(() => activeBrowsers.clear());
  for (const [index, deviceProfile] of ['windows', 'mac', 'linux', 'android', 'iphone', 'ipad'].entries()) {
    activeBrowsers.add({ slot: index + 1, engine: 'obscura', isObscura: true, isManagedProfile: true,
      profileId: `preview_fixture_${index}`, chromeVersion: index < 4 ? '154.0' : '',
      deviceProfile, exitIp: `192.0.2.${index + 1}`, browser: { pages: () => [] },
      isObscuraProcessAlive: () => true });
  }
  activeBrowsers.add({ slot: 7, isClosed: true, isObscura: true, isManagedProfile: true, chromeVersion: '' });
  activeBrowsers.add({ slot: 8, chromeVersion: '', exitIp: '192.0.2.8' });
  const sessions = getAutoRefillStatus().chromeSessions;
  assert.deepEqual(sessions.map(session => session.slot), [1, 2, 3, 4, 5, 6]);
  assert.ok(sessions.every(session => session.engine === 'Obscura'));
  const preview = { _screenSlots: [] };
  runInNewContext(await readFile(new URL('../ui/desktop/functions/_update-screen-slots.js', import.meta.url), 'utf8'), preview);
  preview._updateScreenSlots(sessions);
  assert.equal(preview._screenSlots.length, 6);
  assert.equal(preview._screenSlots[4].deviceProfile, 'iphone');
  assert.equal(preview._screenSlots[5].deviceProfile, 'ipad');
  assert.equal(preview._screenSlots[5].engine, 'Obscura');
});


test('Obscura iPhone/iPad thật xuất hiện trong state và chụp được ảnh preview', { skip: !hasNativeBinary, timeout: 20000 }, async t => {
  const { getAutoRefillStatus } = await import('../src/refill/actions/get-auto-refill-status.mjs');
  const fixture = await createFixture();
  t.after(() => new Promise(resolve => fixture.server.close(resolve)));
  for (const [index, os] of ['iphone', 'ipad'].entries()) {
    const session = await openObscuraBrowser({ slot: 990 + index, port: 0, seed: 42, os, targetUrl: fixture.url });
    try {
      assert.equal(session.chromeVersion, '', 'Profile iOS không có phiên bản Chrome');
      const row = getAutoRefillStatus().chromeSessions.find(candidate => candidate.slot === session.slot);
      assert.ok(row, `${os} phải có trong danh sách preview`);
      assert.equal(row.engine, 'Obscura');
      const jpeg = await session.mainPage.screenshot({ type: 'jpeg', timeout: 3000 });
      assert.equal(jpeg.subarray(0, 3).toString('hex'), 'ffd8ff');
    } finally { await session.close(); }
  }
});

for (const os of ['iphone', 'ipad']) {
  test(`Obscura ${os}: chỉ dùng 4 cặp OS/Safari cho phép, JS/HTTP/preview đồng bộ`, { skip: !hasNativeBinary, timeout: 20000 }, async t => {
    const { generateObscuraProfile } = await import('../src/obscura-engine/generate-obscura-profile.mjs');
    const { getAutoRefillStatus } = await import('../src/refill/actions/get-auto-refill-status.mjs');
    const allowedVersions = new Map([['17.4.1', '17.4'], ['17.5.1', '17.5'], ['17.6.1', '17.6'], ['18.0', '18.0']]);
    const selectedProfiles = new Map();
    for (let seed = 1; seed <= 64; seed++) {
      const profile = generateObscuraProfile({ seed, os });
      const osVersion = profile.os.split(' ')[1];
      assert.ok(allowedVersions.has(osVersion), `OS ngoài danh sách: ${profile.os}`);
      assert.equal(profile.user_agent.match(/Version\/([^ ]+)/)?.[1], allowedVersions.get(osVersion));
      assert.ok(profile.user_agent.includes(`OS ${osVersion.replaceAll('.', '_')} like Mac OS X`));
      assert.ok(profile.user_agent.endsWith('Safari/604.1'));
      assert.equal(profile.chrome_version, '');
      assert.equal(profile.client_hints, null);
      if (!selectedProfiles.has(osVersion)) selectedProfiles.set(osVersion, { seed, profile });
    }
    assert.equal(selectedProfiles.size, 4, 'Phải sinh được đủ các bản đã bổ sung');
    const fixture = await createFixture();
    t.after(() => new Promise(resolve => fixture.server.close(resolve)));
    for (const { seed, profile } of selectedProfiles.values()) {
      fixture.requests.length = 0;
      const session = await openObscuraBrowser({ slot: 992, port: 0, seed, os, targetUrl: fixture.url });
      try {
        const browserIdentity = await session.page.evaluate(() => ({ userAgent: navigator.userAgent, platform: navigator.platform, hints: typeof navigator.userAgentData }));
        assert.equal(browserIdentity.userAgent, profile.user_agent);
        assert.equal(browserIdentity.platform, profile.platform);
        assert.equal(browserIdentity.hints, 'undefined');
        assert.ok(fixture.requests.length > 0);
        for (const request of fixture.requests) {
          assert.equal(request.headers['user-agent'], profile.user_agent);
          assert.equal(request.headers['sec-ch-ua'], undefined);
          assert.equal(request.headers['sec-ch-ua-platform'], undefined);
        }
        const row = getAutoRefillStatus().chromeSessions.find(candidate => candidate.slot === session.slot);
        assert.equal(row.deviceVersion, profile.os);
        assert.equal(row.deviceSummary, `${profile.os} · Obscura`);
      } finally { await session.close(); }
    }
  });
}

test('hai process Obscura chạy song song submit hai info riêng từ các bản sao cùng pool', { skip: !hasNativeBinary, timeout: 35000 }, async t => {
  const { initializeObscuraRuntime } = await import('../src/obscura-engine/initialize-obscura-runtime.mjs');
  const { globalAiConfig } = await import('../src/ai-assist/state/global-ai-config.mjs');
  globalAiConfig.enabled = false;
  const submitted = new Map();
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    const url = new URL(request.url, 'http://fixture.invalid');
    if (url.pathname === '/result') {
      submitted.set(url.searchParams.get('slot'), Object.fromEntries(url.searchParams));
      response.end('<html><body>Fixture received</body></html>');
    } else response.end(`<html><body><form action="/result"><input name="slot" type="hidden" value="${url.searchParams.get('slot') === 'a' ? 'a' : 'b'}"><label>First name<input name="firstName" required></label><label>Email<input name="email" type="email" required></label><button type="submit">Continue</button></form></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const sessions = [];
  t.after(async () => { await Promise.all(sessions.map(session => session.close())); await new Promise(resolve => server.close(resolve)); });
  const records = [{ firstname: 'NativeParallelAlpha' }, { firstname: 'NativeParallelBeta' }];
  await Promise.all(['a', 'b'].map(async (key, index) => {
    const session = await openObscuraBrowser({ slot: 993 + index, port: 0 });
    sessions.push(session);
    await session.browser.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const websiteUrl = `${origin}/?slot=${key}`;
    Object.assign(session, { websiteUrl, offerNumber: 1, offerSolver: 'generic', enableLeadCheck: false, assignedEmail: `${key}@example.invalid` });
    await initializeObscuraRuntime(session, { autofillRecords: structuredClone(records), offerUrls: [websiteUrl], leadConfig: { enabled: false }, autoSubmit: true });
  }));
  const deadline = Date.now() + 25000;
  while (submitted.size < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(submitted.size, 2, 'cả hai process phải submit bằng autofill thật');
  assert.notEqual(submitted.get('a').firstName, submitted.get('b').firstName);
  assert.equal(submitted.get('a').email, 'a@example.invalid');
  assert.equal(submitted.get('b').email, 'b@example.invalid');
  assert.equal(new Set(sessions.map(session => session.currentRecord.firstname)).size, 2);
});
