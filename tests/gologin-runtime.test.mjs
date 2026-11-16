import test from 'node:test';
import { setMacPublicIpLookup } from '../src/proxy/actions/get-mac-public-ip.mjs';
// Không gọi Internet trong test: IP Mac giả, khác mọi IP fixture.
setMacPublicIpLookup(async () => '203.0.113.250');
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const directory = mkdtempSync(join(homedir(), 'Library/Application Support/AutoLeadPC-tests-gologin-runtime-'));
process.env.AUTOLEADPC_DATA_DIR = basename(directory);
process.env.AUTOLEADPC_LOG_MODE = 'access';
const { activeBrowsers } = await import('../src/browser/sessions.mjs');
const { autoRefill } = await import('../src/runtime/constants/auto-refill.mjs');
const { activeExitIpLocks } = await import('../src/runtime/constants/active-exit-ip-locks.mjs');
const { activeProxyLocks } = await import('../src/runtime/constants/active-proxy-locks.mjs');
const { moduleState } = await import('../src/logging/browser-logs/state/module-state.mjs');
const { savePersistedBrowserLogs } = await import('../src/logging/browser-logs.mjs');
const { verifyGoLoginProfileIp } = await import('../src/browser/gologin/verify-profile-ip.mjs');
const globalKeys = [];
test.after(async () => {
  clearTimeout(moduleState.saveBrowserLogsTimer);
  await savePersistedBrowserLogs();
  globalKeys.forEach(key => delete globalThis[key]);
  rmSync(directory, { recursive: true, force: true });
});
test.beforeEach(() => {
  activeBrowsers.clear(); activeExitIpLocks.clear(); activeProxyLocks.clear();
  autoRefill.enabled = false; autoRefill.stopRequested = false; autoRefill.noSlotRefill = false; autoRefill.targetCount = 0;
});

/**
 * Nạp module thật với mock ở biên SDK/mạng, không khởi chạy Orbita hoặc truy cập tài khoản.
 * @param {string} file File source tương đối cần kiểm tra.
 * @param {object} mocks Export cần thay bằng fixture offline.
 * @return {Promise<object>} Module đã nạp trong thư mục cô lập.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function loadFixtureModule(file, mocks) {
  const key = `gologin-test-${randomUUID()}`;
  globalKeys.push(key); globalThis[key] = mocks;
  const source = readFileSync(resolve(file), 'utf8').replace(/import \{([^}]+)\} from '([^']+)';/g, (statement, names, location) => {
    const imports = names.split(',').map(name => name.trim());
    if (imports.every(name => name in mocks)) return `const {${names}} = globalThis[${JSON.stringify(key)}];`;
    const target = location.startsWith('.') ? pathToFileURL(resolve(file, '..', location)).href : location;
    return `import {${names}} from ${JSON.stringify(target)};`;
  });
  const fixture = join(directory, `${randomUUID()}.mjs`);
  writeFileSync(fixture, source);
  return import(pathToFileURL(fixture).href);
}

/**
 * Tạo context và kết nối CDP phát sự kiện đóng giống Playwright.
 * @return {object} Bộ đếm và tài nguyên không truy cập mạng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function createBrowserFixture() {
  const context = new EventEmitter(), browser = new EventEmitter();
  let closed = false;
  const page = new EventEmitter();
  page.isClosed = () => closed; page.url = () => 'https://offer.test/';
  page.evaluate = async () => ({ platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh) Chrome/156.0.8078.47', touchPoints: 0, uaPlatform: 'macOS', uaPlatformVersion: '15.1.0', uaMobile: false });
  page.bringToFront = async () => {};
  context.pages = () => [page];
  context.close = async () => { closed = true; context.emit('close'); };
  browser.version = () => '156.0.8078.47';
  browser.close = async () => { browser.emit('disconnected'); };
  return { context, browser, gl: { profileOs: 'mac' }, wsUrl: 'ws://fixture', page };
}

test('GoLogin đăng ký đúng session, log/lead/autofill và dọn một lần khi context/CDP cùng đóng', async t => {
  t.mock.method(console, 'log', () => {});
  const connected = createBrowserFixture();
  const calls = [], stopped = [], deleted = [], parity = [];
  const { initializeGoLoginRuntime } = await loadFixtureModule('src/browser/gologin/initialize-runtime.mjs', {
    configureGoLoginDevice: async () => {}, decorateGoLoginPages: async () => {}, configureGoLoginWindow: async () => {},
    limitOfferTabs: () => {}, attachUniqueOfferTabs: () => {}, attachBandwidthTracker: () => {},
    openGoLoginOfferTabs: async session => { session.mainPage._assignedRecord = { email: 'fixture@example.invalid' }; },
    closeChromeWhenLastTabCloses: session => calls.push(['close', session]), watchTrafficBlockedPage: session => calls.push(['watch', session]),
    attachGoLoginAutofill: (session, records, config) => calls.push(['autofill', session, config]),
    attachExtraTabGuards: (context, session) => calls.push(['guards', session]),
    attachFullHtmlLoggerToContext: () => parity.push('html'), attachFullHtmlLoggerToBrowser: () => parity.push('htmlBrowser'),
    startManualOpsRecorder: (context, session) => { calls.push(['ops', session]); return { ready: Promise.resolve() }; }
  });
  const { openGoLoginBrowser } = await loadFixtureModule('src/browser/actions/open-gologin-browser.mjs', {
    connectGoLoginProfile: async () => connected, initializeGoLoginRuntime,
    verifyGoLoginProfileIp: async () => '192.0.2.9',
    decorateGoLoginPages: async () => {}, configureGoLoginWindow: async () => {},
    limitOfferTabs: () => {}, attachUniqueOfferTabs: () => {}, attachBandwidthTracker: () => {},
    openGoLoginOfferTabs: async session => { session.mainPage._assignedRecord = { email: 'fixture@example.invalid' }; },
    closeChromeWhenLastTabCloses: session => calls.push(['close', session]),
    watchTrafficBlockedPage: session => calls.push(['watch', session]),
    attachGoLoginAutofill: (session, records, config) => calls.push(['autofill', session, config]),
  });
  const session = await openGoLoginBrowser({ slot: 1, profileId: 'fixture-profile', proxy: { server: 'socks5://127.0.0.1:9999' },
    verifiedExitIp: '192.0.2.9', websiteUrl: 'https://offer.test/', startProfile: async () => {},
    deviceProfile: 'macos-arm', deviceLabel: 'Mac ARM (M2)',
    stopProfile: async () => { stopped.push(true); }, deleteProfile: async () => { deleted.push(stopped.length); return true; }, dataSaver: false,
    leadConfig: { enabled: true, intervalSeconds: 20, maxAttempts: 2 } });
  assert.ok(activeBrowsers.has(session));
  assert.equal(session.mainPage, connected.page);
  const detected = session.logs.find(log => log.type === 'gologin_device_detected');
  assert.equal(detected.ip, '192.0.2.9');
  assert.equal(detected.profileOs, 'mac');
  assert.equal(detected.platform, 'MacIntel');
  assert.equal(detected.uaPlatform, 'macOS');
  assert.equal(detected.orbitaVersion, '156.0.8078.47');
  assert.match(detected.userAgent, /Macintosh/);
  const { persistedBrowserLogs } = await import('../src/logging/browser-logs.mjs');
  const recording = persistedBrowserLogs.find(item => item.id === session.recordingId);
  assert.equal(recording.ip, '192.0.2.9');
  assert.equal(recording.deviceVersion, 'Mac ARM (M2)');
  assert.equal(recording.goLoginOs, 'mac');
  assert.equal(recording.goLoginPlatform, 'MacIntel');
  assert.equal(recording.goLoginUserAgent, detected.userAgent);
  for (const call of calls) assert.equal(call[1], session, `${call[0]} nhận session thật`);
  assert.equal(calls.find(call => call[0] === 'autofill')[2].intervalSeconds, 20);
  assert.ok(['guards', 'ops'].every(name => calls.some(call => call[0] === name)), 'GoLogin có canh tab mới và ghi thao tác tay như Chrome');
  assert.ok(parity.includes('html'), 'GoLogin lưu HTML trang như Chrome (khi bật gỡ lỗi)');
  session.confirmedLeadIp = session.exitIp; session.leadCheckStatus = 'confirmed';
  session.addBrowserLog({ type: 'lead_confirmed', detail: 'fixture lead' });
  await connected.context.close();
  connected.browser.emit('disconnected');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stopped.length, 1);
  assert.deepEqual(deleted, [1], 'xóa profile đúng một lần, sau khi Orbita đã dừng');
  assert.equal(activeBrowsers.has(session), false);
  assert.equal(session.logs.filter(log => log.type === 'session_closed').length, 1);
  assert.ok(session.logs.findIndex(log => log.type === 'gologin_profile_deleted') < session.logs.findIndex(log => log.type === 'session_closed'));
  assert.equal(session.logs.at(-1).confirmedLeadIp, '192.0.2.9');
});

test('xác minh IP profile khác proxy phải dừng, không dùng IP dự phòng khi mạng lỗi', async () => {
  let closes = 0;
  const context = { newPage: async () => ({
    goto: async () => ({ ok: () => true }),
    locator: () => ({ innerText: async () => '{"ip":"192.0.2.2"}' }),
    close: async () => { closes++; }
  }) };
  await assert.rejects(verifyGoLoginProfileIp(context, '192.0.2.1'), /khác IP/);
  assert.equal(closes, 1);
  context.newPage = async () => ({ goto: async () => { throw new Error('network'); }, close: async () => {} });
  await assert.rejects(verifyGoLoginProfileIp(context, '192.0.2.1'), /Không xác minh/);
});

test('CDP kết nối lỗi vẫn dừng profile SDK đã mở', async () => {
  let stops = 0;
  const { connectGoLoginProfile } = await loadFixtureModule('src/browser/gologin/connect-profile.mjs', {
    chromium: { connectOverCDP: async () => { throw new Error('fixture CDP failed'); } }
  });
  await assert.rejects(connectGoLoginProfile(async () => ({ wsUrl: 'ws://fixture', gl: {} }), async () => { stops++; }), /CDP failed/);
  assert.equal(stops, 1);
});

/**
 * Nạp launcher thật với dịch vụ tài khoản/IP giả, vẫn dùng khóa proxy/IP thật của core.
 * @param {Function} readIp Hàm trả IP kiểm tra cho mỗi proxy.
 * @return {Promise<object>} Launcher và danh sách tham số opener nhận được.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function createLauncherFixture(readIp = async () => '192.0.2.1') {
  const opened = [];
  const launcher = await loadFixtureModule('src/browser/actions/launch-gologin-browsers.mjs', {
    waitForStableProxyIp: async (proxy, probe) => probe(),
    fetchProxyGeo: async () => null,
    pickGoLoginDeviceHardware: async () => null,
    readGoLoginConfig: async () => ({ token: 'fixture-token' }), saveGoLoginConfig: async () => {},
    saveAutoRefillSettings: async () => {}, readProxyUsageHistory: async () => ({ version: 1, proxies: {} }),
    persistProxyUsageHistory: async () => {}, saveProxyQueue: async () => {},
    checkProxyExitIp: readIp,
    createGoLoginProfile: async (token, request) => `fixture-${request.name.match(/^Slot (\d+)/)[1]}`,
    deleteGoLoginProfile: async () => true,
    openGoLoginBrowser: async options => { opened.push(options); const session = { ...options, isGoLogin: true, exitIp: options.verifiedExitIp }; activeBrowsers.add(session); return session; }
  });
  return { ...launcher, opened };
}

test('hết hoặc thiếu proxy không mở Direct; hai proxy cùng IP chỉ mở một browser', async () => {
  const { launchGoLoginBrowsers, opened } = await createLauncherFixture();
  const input = { concurrency: 2, websiteUrl: 'https://offer.test/', proxyList: '' };
  const missing = await launchGoLoginBrowsers(JSON.stringify(input));
  assert.equal(opened.length, 0);
  assert.match(missing.warnings.join(''), /Không còn proxy/);
  input.proxyList = '127.0.0.1:9001\n127.0.0.1:9002';
  await launchGoLoginBrowsers(JSON.stringify(input));
  assert.equal(opened.length, 1);
  assert.equal(opened[0].proxy.server, 'socks5://127.0.0.1:9001');
});

test('bù giữ phân công Offer 2, thời gian 2×20s và cấu hình target; proxy lỗi không mở SDK', async () => {
  const { launchGoLoginBrowsers, opened } = await createLauncherFixture();
  autoRefill.enabled = true; autoRefill.targetCount = 7;
  await launchGoLoginBrowsers(JSON.stringify({ concurrency: 1, proxyList: '127.0.0.1:9101',
    offerUrls: ['https://one.test/', 'https://two.test/'], enableLeadCheck: true,
    leadCheckInterval: 20, leadCheckMaxAttempts: 2, autoCloseNoLead: false }), true, [2]);
  assert.equal(opened[0].offer, 2);
  assert.equal(opened[0].websiteUrl, 'https://two.test/');
  assert.equal(opened[0].leadConfig.intervalSeconds, 20);
  assert.equal(opened[0].leadConfig.maxAttempts, 2);
  assert.equal(opened[0].leadConfig.autoCloseNoLead, false);
  assert.equal(autoRefill.targetCount, 7);
  const dead = await createLauncherFixture(async () => null);
  await dead.launchGoLoginBrowsers(JSON.stringify({ concurrency: 1, websiteUrl: 'https://offer.test/', proxyList: '127.0.0.1:9201' }));
  assert.equal(dead.opened.length, 0);
});

test('mở đủ các URL duy nhất, gán record và session chuột riêng cho từng tab', async () => {
  const pages = [];
  const context = { newPage: async () => { const page = { goto: async url => { page.destination = url; } }; pages.push(page); return page; } };
  const mainPage = await context.newPage();
  const { openGoLoginOfferTabs } = await loadFixtureModule('src/browser/gologin/open-offer-tabs.mjs', {
    configurePageMousePolicy: (page, session) => { page._autofillSession = session; },
    takeNextRecord: records => ({ ...records[pages.length - 1] })
  });
  const session = { slot: 1, browser: context, mainPage, websiteUrl: 'https://one.test/', offerNumber: 2 };
  await openGoLoginOfferTabs(session, ['https://one.test/', 'https://two.test/', 'https://one.test/'], [{ id: 1 }, { id: 2 }]);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages.map(page => page.destination), ['https://one.test/', 'https://two.test/']);
  assert.deepEqual(pages.map(page => page._assignedRecord.id), [1, 2]);
  assert.ok(pages.every(page => page._autofillSession === session));
});

test('autofill nhận đúng record/session/options; chỉ check lead sau email hợp lệ và có tick', async () => {
  const calls = [], checks = [];
  const { attachGoLoginAutofill } = await loadFixtureModule('src/browser/gologin/attach-autofill.mjs', {
    attachAutofill: (...args) => calls.push(args), startLeadVerification: (...args) => { checks.push(args); }
  });
  const session = { browser: {}, mainPage: { _assignedRecord: { email: 'fixture@example.invalid' } }, websiteUrl: 'https://offer.test/path', offerNumber: 2 };
  const records = [{ id: 1 }], config = { enabled: true, intervalSeconds: 20 };
  attachGoLoginAutofill(session, records, config, false);
  const [context, pool, origin, attachedSession, options] = calls[0];
  assert.equal(context, session.browser); assert.equal(pool, records); assert.equal(attachedSession, session);
  assert.equal(origin, 'https://offer.test'); assert.equal(options.autoSubmit, false);
  options.onEmailSubmitted(session); assert.equal(checks.length, 0);
  session.emailFilled = true; options.onEmailSubmitted(session);
  assert.equal(checks.length, 1); assert.equal(checks[0][0], session); assert.equal(checks[0][1], config);
  options.onRecordPicked({}); assert.equal(session.currentRecord, session.mainPage._assignedRecord);
  config.enabled = false; options.onEmailSubmitted(session); assert.equal(checks.length, 1);
});

test('khởi tạo sau CDP thất bại vẫn dọn session, dừng rồi xóa profile của phiên', async t => {
  t.mock.method(console, 'log', () => {});
  const connected = createBrowserFixture();
  let stops = 0, deletes = 0;
  const { openGoLoginBrowser } = await loadFixtureModule('src/browser/actions/open-gologin-browser.mjs', {
    connectGoLoginProfile: async () => connected,
    verifyGoLoginProfileIp: async () => '192.0.2.19',
    configureGoLoginWindow: async () => {},
    initializeGoLoginRuntime: async () => { throw new Error('fixture init failed'); }
  });
  await assert.rejects(openGoLoginBrowser({ slot: 1, profileId: 'existing-owned',
    proxy: { server: 'socks5://127.0.0.1:9999' }, verifiedExitIp: '192.0.2.19', websiteUrl: 'https://offer.test/',
    stopProfile: async () => { stops++; }, deleteProfile: async () => { deletes++; return true; } }), /init failed/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stops, 1);
  assert.equal(deletes, 1);
  assert.equal(activeBrowsers.size, 0);
});

test('Start GoLogin lưu token riêng, không để token lọt vào cấu hình lượt chạy hoặc tự bù', async () => {
  const saved = [], dispatched = [], credentials = [];
  const { launchUserRequestedBrowsers } = await loadFixtureModule('src/browser/actions/launch-user-requested-browsers.mjs', {
    saveGoLoginConfig: async config => credentials.push(config),
    writeFile: async (file, value) => saved.push(value), saveAutoRefillSettings: async () => {},
    launchGoLoginBrowsers: async body => { dispatched.push(JSON.parse(body)); activeBrowsers.add({ slot: 1 }); return { results: [], warnings: [] }; }
  });
  await launchUserRequestedBrowsers(JSON.stringify({ useGoLogin: true, concurrency: 1,
    gologinToken: 'fixture-secret-token', websiteUrl: 'https://offer.test/' }));
  assert.equal(credentials[0].token, 'fixture-secret-token');
  assert.equal(dispatched[0].gologinToken, undefined);
  assert.equal(JSON.stringify(autoRefill.settings).includes('fixture-secret-token'), false);
  assert.ok(saved.length > 0);
  assert.ok(saved.every(value => !value.includes('fixture-secret-token')));
});

test('SDK dừng lỗi thì giữ khóa IP/proxy và ghi lỗi thay vì cấp lại tài nguyên đang chạy', async t => {
  t.mock.method(console, 'log', () => {}); t.mock.method(console, 'warn', () => {});
  const { attachGoLoginSessionLifecycle } = await import('../src/browser/gologin/attach-session-lifecycle.mjs');
  const connected = createBrowserFixture();
  const events = [];
  const session = { browser: connected.context, _cdpBrowser: connected.browser, isClosed: true,
    _gologinProcess: { pid: 123, exitCode: null, signalCode: null },
    proxy: { server: 'socks5://127.0.0.1:9999' }, exitIp: '192.0.2.29', profileId: 'stop-failed',
    _stopProfile: async () => { throw new Error('fixture stop failed'); }, addBrowserLog: entry => events.push(entry) };
  const { acquireProxyLock } = await import('../src/proxy/actions/acquire-proxy-lock.mjs');
  const { isProxyCurrentlyActive } = await import('../src/proxy/actions/is-proxy-currently-active.mjs');
  acquireProxyLock(session.proxy); activeExitIpLocks.add(session.exitIp);
  attachGoLoginSessionLifecycle(session);
  await connected.context.close();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(isProxyCurrentlyActive(session.proxy), true);
  assert.equal(activeExitIpLocks.has(session.exitIp), true);
  assert.ok(events.some(entry => entry.type === 'gologin_profile_stop_failed'));
});

/**
 * Nút đóng slot phải dừng SDK và chờ xóa profile ngay cả khi Context.close không phát sự kiện.
 * @return {Promise<void>} Dừng/xóa đúng một lần và HTTP chỉ hoàn tất sau bước xóa.
 * @throws {AssertionError} Khi bỏ sót cleanup hoặc trả kết quả trước khi profile được xóa.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
async function closesGoLoginSlotWithoutContextEvent() {
  const connected = createBrowserFixture();
  const calls = [];
  connected.context.close = async () => { calls.push('context_close'); };
  const { openGoLoginBrowser } = await loadFixtureModule('src/browser/actions/open-gologin-browser.mjs', {
    connectGoLoginProfile: async () => connected,
    verifyGoLoginProfileIp: async () => '192.0.2.39',
    configureGoLoginWindow: async () => {}, initializeGoLoginRuntime: async () => {}
  });
  let completeDeletion;
  const pendingDeletion = new Promise(resolve => { completeDeletion = resolve; });
  const session = await openGoLoginBrowser({ slot: 39, profileId: 'windows-close-fixture',
    proxy: { server: 'socks5://127.0.0.1:9999' }, verifiedExitIp: '192.0.2.39', websiteUrl: 'https://offer.test/',
    stopProfile: async () => { calls.push('stop'); },
    closeRelay: async () => { calls.push('relay'); throw new Error('fixture relay statistics write failed'); },
    deleteProfile: async () => { calls.push('delete'); await pendingDeletion; return true; } });
  const { handlePostBrowserClose } = await import('../src/http/routes/browser/post-close.mjs');
  let response;
  const closing = handlePostBrowserClose({ method: 'POST', url: '/browser/close/39' }, { writeHead() {}, end(body) { response = JSON.parse(body); } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.slice(0, 3), ['stop', 'relay', 'delete']);
  assert.equal(response, undefined, 'Không được báo thành công khi xóa profile còn đang chạy');
  const sameClosing = session.closeGoLoginSession();
  completeDeletion();
  await Promise.all([closing, sameClosing]);
  connected.context.emit('close');
  connected.browser.emit('disconnected');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(response.ok, true);
  assert.equal(calls.filter(call => call === 'delete').length, 1);
  assert.equal(session._gologinProfileStopped, true);
  assert.equal(activeBrowsers.has(session), false);
}
test('đóng slot GoLogin chủ động không phụ thuộc sự kiện close/disconnect của Windows', closesGoLoginSlotWithoutContextEvent);

test('đóng GoLogin không báo thành công khi dừng SDK hoặc xóa profile thất bại', async () => {
  const { handlePostBrowserClose } = await import('../src/http/routes/browser/post-close.mjs');
  for (const stopped of [false, true]) {
    const session = { slot: 40, isGoLogin: true, closeGoLoginSession: async () => {
      session._gologinProfileStopped = stopped;
      session._gologinProfileDeleted = false;
    } };
    activeBrowsers.add(session);
    let status, response;
    await handlePostBrowserClose({ method: 'POST', url: '/browser/close/40' }, { writeHead(code) { status = code; }, end(body) { response = JSON.parse(body); } });
    assert.equal(status, 500);
    assert.ok(response.error);
    assert.notEqual(response.ok, true);
    activeBrowsers.delete(session);
  }
});

test('đóng tab cuối qua Screen View gọi dọn GoLogin dù không có sự kiện context close', async () => {
  let pageClosed = false, cleanupCalls = 0, response;
  const page = { isClosed: () => pageClosed, close: async () => { pageClosed = true; } };
  const session = { slot: 41, isGoLogin: true, browser: { pages: () => [page] }, closeGoLoginSession: async () => {
    cleanupCalls += 1;
    session._gologinProfileStopped = true;
    session._gologinProfileDeleted = true;
  } };
  activeBrowsers.add(session);
  const { handlePostScreenTabsClose } = await loadFixtureModule('src/http/routes/screen/post-tabs-close.mjs', { readRequestBody: async () => '{}' });
  await handlePostScreenTabsClose({ method: 'POST', url: '/screen/tabs/close/41' }, { writeHead() {}, end(body) { response = JSON.parse(body); } });
  assert.equal(cleanupCalls, 1);
  assert.equal(response.closedSession, true);
  activeBrowsers.delete(session);
});

test('Đóng tất cả gọi dọn GoLogin trực tiếp thay vì chờ context close', async () => {
  let cleanupCalls = 0;
  const session = { slot: 42, profileId: 'bulk-close-fixture', isGoLogin: true, isManagedProfile: true,
    browser: { close: async () => { throw new Error('Không được phụ thuộc context.close'); } },
    closeGoLoginSession: async () => { cleanupCalls += 1; session._gologinProfileStopped = true; activeBrowsers.delete(session); } };
  activeBrowsers.add(session);
  const { closeActiveBrowsers } = await loadFixtureModule('src/browser/actions/close-active-browsers.mjs', {
    executeFile: async () => {}, readAdsPowerApiKey: async () => '', writeFile: async () => {}, stopAllContinuousAgents: () => {}
  });
  await closeActiveBrowsers();
  assert.equal(cleanupCalls, 1);
  assert.equal(activeBrowsers.has(session), false);
});

test('Đóng tất cả giữ khóa IP/proxy khi chưa dừng được GoLogin', async () => {
  const session = { slot: 43, profileId: 'bulk-stop-failed-fixture', isGoLogin: true, isManagedProfile: true,
    closeGoLoginSession: async () => { activeBrowsers.delete(session); } };
  activeBrowsers.add(session);
  activeExitIpLocks.add('192.0.2.43');
  activeProxyLocks.add('fixture-owned-proxy');
  const { closeActiveBrowsers } = await loadFixtureModule('src/browser/actions/close-active-browsers.mjs', {
    executeFile: async () => {}, readAdsPowerApiKey: async () => '', writeFile: async () => {}, stopAllContinuousAgents: () => {}
  });
  const result = await closeActiveBrowsers();
  assert.equal(activeExitIpLocks.has('192.0.2.43'), true);
  assert.equal(activeProxyLocks.has('fixture-owned-proxy'), true);
  assert.ok(result.warnings.length);
});

test('khởi tạo lỗi mà SDK chưa dừng thì launcher cũng không nhả khóa IP/proxy', async () => {
  let deletes = 0;
  const { launchGoLoginBrowsers } = await loadFixtureModule('src/browser/actions/launch-gologin-browsers.mjs', {
    waitForStableProxyIp: async (proxy, probe) => probe(),
    fetchProxyGeo: async () => null,
    pickGoLoginDeviceHardware: async () => null,
    readGoLoginConfig: async () => ({ token: 'fixture-token' }), saveAutoRefillSettings: async () => {},
    readProxyUsageHistory: async () => ({ version: 1, proxies: {} }),
    checkProxyExitIp: async () => '192.0.2.39', createGoLoginProfile: async () => 'fixture-profile',
    deleteGoLoginProfile: async () => { deletes++; return true; },
    openGoLoginBrowser: async () => { const error = new Error('fixture startup failed'); error.goLoginStopUnconfirmed = true; throw error; }
  });
  const result = await launchGoLoginBrowsers(JSON.stringify({ concurrency: 1, websiteUrl: 'https://offer.test/', proxyList: '127.0.0.1:9393' }));
  assert.equal(result.results.length, 0);
  assert.equal(activeExitIpLocks.has('192.0.2.39'), true);
  const { isProxyCurrentlyActive } = await import('../src/proxy/actions/is-proxy-currently-active.mjs');
  assert.equal(isProxyCurrentlyActive({ server: 'socks5://127.0.0.1:9393' }), true);
  assert.equal(deletes, 0, 'Orbita chưa dừng thì không xóa profile');
});

test('mỗi lượt mở tạo profile mới; lượt mở lỗi đã dừng Orbita thì xóa đúng profile vừa tạo', async () => {
  const created = [], deleted = [];
  const { launchGoLoginBrowsers } = await loadFixtureModule('src/browser/actions/launch-gologin-browsers.mjs', {
    waitForStableProxyIp: async (proxy, probe) => probe(),
    fetchProxyGeo: async () => null,
    pickGoLoginDeviceHardware: async () => null,
    readGoLoginConfig: async () => ({ token: 'fixture-token' }), saveAutoRefillSettings: async () => {},
    readProxyUsageHistory: async () => ({ version: 1, proxies: {} }),
    checkProxyExitIp: async proxy => `192.0.2.${proxy.server.slice(-2)}`,
    createGoLoginProfile: async () => { created.push(`profile-${created.length + 1}`); return created.at(-1); },
    deleteGoLoginProfile: async (token, profileId) => { deleted.push(profileId); return true; },
    openGoLoginBrowser: async () => { throw new Error('fixture IP mismatch'); }
  });
  await launchGoLoginBrowsers(JSON.stringify({ concurrency: 2, websiteUrl: 'https://offer.test/', proxyList: '127.0.0.1:9451\n127.0.0.1:9452' }));
  assert.deepEqual(created, ['profile-1', 'profile-2']);
  assert.deepEqual(deleted, ['profile-1', 'profile-2']);
});

test('tick đủ sáu hệ điều hành thì GoLogin mở đủ lựa chọn, không chặn iPhone/iPad hoặc bỏ chọn mặc định', async () => {
  let address = 40;
  const { launchGoLoginBrowsers, opened } = await createLauncherFixture(async () => `192.0.2.${++address}`);
  const proxyList = Array.from({ length: 8 }, (_, index) => `127.0.0.1:${9500 + index}`).join('\n');
  const result = await launchGoLoginBrowsers(JSON.stringify({ concurrency: 8, proxyList,
    websiteUrl: 'https://offer.test/', Windows: true, Mac: true, Linux: true, Android: true, iPhone: true, iPad: true }));
  assert.equal(result.warnings.length, 0);
  // Mở song song nên thứ tự gọi không cố định; thiết bị gắn theo slot.
  opened.sort((left, right) => left.slot - right.slot);
  assert.deepEqual(opened.map(options => options.deviceProfile), ['windows', 'windows11', 'macos-intel', 'macos-arm', 'linux', 'android', 'ios', 'ipad']);
  assert.ok(opened[6].userAgent.includes('iPhone'));
  assert.ok(opened[7].userAgent.includes('iPad'));
  for (const options of opened) {
    const version = options.userAgent.match(/(?:Chrome|CriOS)\/(\d+)\./)[1];
    const { browserVersion } = options.startupSession;
    assert.ok(['148', '149', '150', '151', '152', '153', '154', '156'].includes(version), `bản Orbita ${version} ngoài dải 148–156 hoặc là 155`);
    assert.ok(browserVersion.startsWith(`${version}.`), 'UA và số build đầy đủ cùng một bản Orbita');
    assert.equal(options.startupSession.chromeVersion, /iPhone|iPad/.test(options.userAgent) ? 'Orbita' : `Orbita ${browserVersion}`);
    if (options.deviceProfile === 'android') assert.ok(options.userAgent.includes(`Chrome/${browserVersion} Mobile`), 'Android gửi UA đầy đủ để Orbita tự rút gọn và giữ số build ở Client Hints');
  }
});

test('chỉ chọn iPhone hoặc iPad vẫn mở đúng lựa chọn khi bù, không chuyển sang Mac mặc định', async () => {
  for (const [flag, device] of [['iPhone', 'ios'], ['iPad', 'ipad']]) {
    activeBrowsers.clear(); activeExitIpLocks.clear(); activeProxyLocks.clear();
    const { launchGoLoginBrowsers, opened } = await createLauncherFixture();
    await launchGoLoginBrowsers(JSON.stringify({ concurrency: 1, websiteUrl: 'https://offer.test/',
      proxyList: '127.0.0.1:9595', [flag]: true }), true, [1]);
    assert.equal(opened[0].deviceProfile, device);
  }
});

test('bù slot iPhone trong danh sách tám thiết bị vẫn giữ đúng thiết bị của slot', async () => {
  for (const slot of [1, 2, 3, 4, 5, 6, 8]) activeBrowsers.add({ slot });
  const { launchGoLoginBrowsers, opened } = await createLauncherFixture();
  await launchGoLoginBrowsers(JSON.stringify({ concurrency: 1, websiteUrl: 'https://offer.test/',
    proxyList: '127.0.0.1:9596', Windows: true, Mac: true, Linux: true, Android: true, iPhone: true, iPad: true }), true, [1]);
  assert.equal(opened[0].slot, 7);
  assert.equal(opened[0].deviceProfile, 'ios');
});

test('ô Hệ điều hành người dùng tick quyết định thiết bị GoLogin; mục GoLogin chỉ chọn biến thể trong họ', async () => {
  let ip = 70;
  const { launchGoLoginBrowsers, opened } = await createLauncherFixture(async () => `192.0.2.${++ip}`);
  await launchGoLoginBrowsers(JSON.stringify({ concurrency: 3, websiteUrl: 'https://offer.test/',
    proxyList: Array.from({ length: 3 }, (_, index) => `127.0.0.1:${9700 + index}`).join('\n'),
    Windows: false, Mac: true, iPhone: true, gologinDevices: ['windows', 'macos-arm', 'linux'] }));
  opened.sort((left, right) => left.slot - right.slot);
  assert.deepEqual(opened.map(item => item.deviceProfile), ['macos-arm', 'ios', 'macos-arm']);
  assert.ok(opened[0].userAgent.includes('Macintosh'));
  assert.ok(opened[1].userAgent.includes('iPhone'));
});

test('launcher truyền các phiên bản Orbita khác nhau vào cả nhãn lẫn User-Agent', async () => {
  const versions = ['148', '149', '152', '156'];
  const versionIndexes = [0, 1, 4, 7];
  let cursor = 0, ip = 80;
  const opened = [];
  const { launchGoLoginBrowsers } = await loadFixtureModule('src/browser/actions/launch-gologin-browsers.mjs', {
    waitForStableProxyIp: async (proxy, probe) => probe(),
    fetchProxyGeo: async () => null,
    pickGoLoginDeviceHardware: async () => null,
    readGoLoginConfig: async () => ({ token: 'fixture-token', devices: ['windows11', 'macos-arm'] }),
    saveAutoRefillSettings: async () => {}, readProxyUsageHistory: async () => ({ version: 1, proxies: {} }),
    persistProxyUsageHistory: async () => {}, saveProxyQueue: async () => {},
    checkProxyExitIp: async () => `192.0.2.${++ip}`, createGoLoginProfile: async () => 'fixture-profile',
    deleteGoLoginProfile: async () => true, randomInt: () => versionIndexes[cursor++],
    resolveOrbitaFullVersion: async major => `${major}.0.1000.1`,
    openGoLoginBrowser: async options => { opened.push(options); const session = { ...options, isGoLogin: true }; activeBrowsers.add(session); return session; }
  });
  await launchGoLoginBrowsers(JSON.stringify({ concurrency: 4, websiteUrl: 'https://offer.test/',
    proxyList: Array.from({ length: 4 }, (_, index) => `127.0.0.1:${9800 + index}`).join('\n') }));
  assert.deepEqual(opened.map(item => item.userAgent.match(/Chrome\/(\d+)/)[1]), versions);
  assert.deepEqual(opened.map(item => item.startupSession.chromeVersion), versions.map(version => `Orbita ${version}.0.1000.1`));
  assert.ok(opened.every(item => item.userAgent.includes('.0.1000.1 ')), 'UA mang số build đầy đủ');
  assert.deepEqual(opened.map(item => item.deviceProfile), ['windows11', 'macos-arm', 'windows11', 'macos-arm']);
});

test('lỗi IP trước runtime vẫn có nhật ký pha và kết thúc, trước khi SDK bị dừng', async t => {
  t.mock.method(console, 'log', () => {});
  const connected = createBrowserFixture();
  let stops = 0;
  const { persistedBrowserLogs } = await import('../src/logging/browser-logs.mjs');
  const { openGoLoginBrowser } = await loadFixtureModule('src/browser/actions/open-gologin-browser.mjs', {
    connectGoLoginProfile: async () => connected, configureGoLoginWindow: async () => {},
    verifyGoLoginProfileIp: async () => { throw Object.assign(new Error('fixture IP mismatch'), { code: 'GOLOGIN_IP_MISMATCH' }); }
  });
  await assert.rejects(openGoLoginBrowser({ slot: 77, profileId: 'failed-ip', proxy: { server: 'http://fixture.invalid:9000' },
    verifiedExitIp: '192.0.2.77', websiteUrl: 'https://fixture.invalid/', stopProfile: async () => {
      assert.ok(persistedBrowserLogs[0].logs.some(event => event.type === 'gologin_start_failed'));
      stops++;
    } }), /IP mismatch/);
  await new Promise(resolve => setImmediate(resolve));
  const recording = persistedBrowserLogs.find(item => item.slot === 77);
  const failed = recording.logs.find(event => event.type === 'gologin_start_failed');
  assert.equal(failed.phase, 'verify_ip'); assert.equal(failed.reasonCode, 'GOLOGIN_IP_MISMATCH');
  assert.equal(recording.closeReasonType, 'gologin_start_failed');
  assert.equal(stops, 1); assert.ok(recording.endedAt);
});

test('mất CDP khi Orbita còn sống không bị prune/kill; nối lại đúng browser và giữ lead/record', async t => {
  t.mock.method(console, 'log', () => {});
  const oldContext = new EventEmitter(), oldBrowser = new EventEmitter();
  oldContext.pages = () => [];
  oldBrowser.isConnected = () => false;
  const newContext = new EventEmitter(), newBrowser = new EventEmitter();
  newContext.pages = () => []; newBrowser.contexts = () => [newContext]; newBrowser.close = async () => {};
  newBrowser.isConnected = () => true;
  const child = new EventEmitter(); Object.assign(child, { pid: 123, exitCode: null, signalCode: null });
  let stops = 0, restored = 0, refills = 0;
  const events = [];
  const session = { slot: 88, browser: oldContext, _cdpBrowser: oldBrowser, isManagedProfile: true, isGoLogin: true,
    profileId: 'still-alive', browserWebSocketUrl: 'ws://fixture', _gologinProcess: child,
    exitIp: '192.0.2.88', confirmedLeadIp: '192.0.2.88', currentRecord: { id: 'keep-record' },
    addBrowserLog: event => events.push(event), _stopProfile: async () => { stops++; session._gologinProfileStopped = true; } };
  const { attachGoLoginSessionLifecycle } = await loadFixtureModule('src/browser/gologin/attach-session-lifecycle.mjs', {
    chromium: { connectOverCDP: async () => newBrowser }, queueAutomaticRefill: () => { refills++; }
  });
  attachGoLoginSessionLifecycle(session, 0, async replacement => {
    assert.equal(replacement.context, newContext);
    session.browser = replacement.context; session._cdpBrowser = replacement.browser; restored++;
  });
  activeBrowsers.add(session); activeExitIpLocks.add(session.exitIp);
  oldContext.emit('close'); oldBrowser.emit('disconnected');
  const { pruneDeadManagedSessions } = await import('../src/runtime/actions/prune-dead-managed-sessions.mjs');
  await pruneDeadManagedSessions();
  assert.equal(activeBrowsers.has(session), true); assert.equal(stops, 0); assert.equal(refills, 0);
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal(restored, 1); assert.equal(stops, 0);
  assert.equal(session.confirmedLeadIp, '192.0.2.88'); assert.equal(session.currentRecord.id, 'keep-record');
  assert.equal(activeExitIpLocks.has(session.exitIp), true);
  assert.ok(events.some(event => event.type === 'gologin_connection_restored'));
  child.exitCode = 0; child.emit('exit', 0, null);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stops, 1); assert.equal(activeBrowsers.has(session), false);
});

test('chạy trong app không thực hiện lệnh hiện/ẩn cửa sổ; lỗi ẩn headful được giữ log', async () => {
  const { configureGoLoginWindow } = await import('../src/browser/gologin/configure-window.mjs');
  const context = new EventEmitter();
  const page = { bringToFront: async () => {}, isClosed: () => false };
  context.pages = () => [page]; context.newCDPSession = () => assert.fail('Headless không điều khiển cửa sổ OS');
  const session = { browser: context, mainPage: page, trueHeadless: true };
  await configureGoLoginWindow(session, true);
  assert.equal(session.isWindowVisible, false); assert.equal(await session.showWindow(), false);
  const other = new EventEmitter(); other.pages = () => [page];
  other.newCDPSession = async () => { throw new Error('fixture hidden error'); };
  const logs = [];
  await configureGoLoginWindow({ browser: other, mainPage: page, addBrowserLog: event => logs.push(event) }, true);
  assert.equal(logs[0].type, 'window_visibility_error');
});

test('proxy đổi IP: IP trong Orbita khác IP app thì lập tức dừng phiên, không nhận IP mới dù chưa dùng', async t => {
  t.mock.method(console, 'log', () => {});
  const mismatch = () => Object.assign(new Error('IP lệch'), { code: 'GOLOGIN_IP_MISMATCH', detectedIp: '192.0.2.201', expectedIp: '192.0.2.200' });
  activeBrowsers.clear();
  const connected = createBrowserFixture();
  const { openGoLoginBrowser } = await loadFixtureModule('src/browser/actions/open-gologin-browser.mjs', {
    connectGoLoginProfile: async () => connected, configureGoLoginWindow: async () => {},
    verifyGoLoginProfileIp: async () => { throw mismatch(); },
    initializeGoLoginRuntime: async () => {}
  });
  const opening = openGoLoginBrowser({ slot: 1, profileId: 'ip-drift', proxy: { server: 'socks5://127.0.0.1:9999' },
    verifiedExitIp: '192.0.2.200', websiteUrl: 'https://offer.test/', stopProfile: async () => {},
    adoptDetectedExitIp: () => false });
  await assert.rejects(opening, /IP lệch/);
});

test('launcher không nhận IP lệch: IP trong Orbita và app phải giống nhau 100%', async () => {
  const answers = [];
  const { launchGoLoginBrowsers } = await loadFixtureModule('src/browser/actions/launch-gologin-browsers.mjs', {
    waitForStableProxyIp: async (proxy, probe) => probe(),
    fetchProxyGeo: async () => null,
    pickGoLoginDeviceHardware: async () => null,
    readGoLoginConfig: async () => ({ token: 'fixture-token' }), saveAutoRefillSettings: async () => {},
    readProxyUsageHistory: async () => ({ version: 1, proxies: {} }), persistProxyUsageHistory: async () => {}, saveProxyQueue: async () => {},
    checkProxyExitIp: async () => '192.0.2.210',
    createGoLoginProfile: async () => 'drift-profile', deleteGoLoginProfile: async () => true,
    openGoLoginBrowser: async options => {
      answers.push(options.adoptDetectedExitIp('192.0.2.250'));
      answers.push(options.adoptDetectedExitIp('192.0.2.211'));
      const session = { ...options, isGoLogin: true, exitIp: '192.0.2.210' }; activeBrowsers.add(session); return session;
    }
  });
  activeExitIpLocks.add('192.0.2.250');
  await launchGoLoginBrowsers(JSON.stringify({ concurrency: 1, websiteUrl: 'https://offer.test/', proxyList: '127.0.0.1:9461' }));
  assert.deepEqual(answers, [false, false], 'Tuyệt đối không nhận IP lệch');
  assert.equal(activeExitIpLocks.has('192.0.2.210'), true);
  assert.equal(activeExitIpLocks.has('192.0.2.211'), false);
});

test('GoLogin hết hạn mức profile (403) thì dừng lượt mở, báo rõ lý do, không thử lại slot', async () => {
  let creates = 0;
  const { launchGoLoginBrowsers } = await loadFixtureModule('src/browser/actions/launch-gologin-browsers.mjs', {
    waitForStableProxyIp: async (proxy, probe) => probe(),
    fetchProxyGeo: async () => null,
    pickGoLoginDeviceHardware: async () => null,
    readGoLoginConfig: async () => ({ token: 'fixture-token' }), saveAutoRefillSettings: async () => {},
    readProxyUsageHistory: async () => ({ version: 1, proxies: {} }),
    checkProxyExitIp: async proxy => `192.0.2.${proxy.server.slice(-2)}`,
    createGoLoginProfile: async () => { creates++; throw Object.assign(new Error('Tạo profile GoLogin thất bại (HTTP 403).'), { code: 'GOLOGIN_PROFILE_LIMIT' }); },
    deleteGoLoginProfile: async () => true, openGoLoginBrowser: async () => { throw new Error('không được gọi'); }
  });
  const result = await launchGoLoginBrowsers(JSON.stringify({ concurrency: 3, websiteUrl: 'https://offer.test/',
    proxyList: '127.0.0.1:9471\n127.0.0.1:9472\n127.0.0.1:9473\n127.0.0.1:9474\n127.0.0.1:9475' }));
  // 3 lượt chạy song song nên có thể cùng gặp 403, nhưng mỗi slot chỉ thử một lần và lượt mở dừng hẳn.
  assert.ok(creates >= 1 && creates <= 3, `creates=${creates}`);
  assert.match(result.warnings.join(''), /đủ số profile tối đa/);
  assert.equal(activeExitIpLocks.size, 0, 'nhả mọi khóa IP của các lượt bị 403');
  assert.equal(activeExitIpLocks.has('192.0.2.71'), false, 'nhả khóa IP của lượt bị 403');
});

test('UA GoLogin dùng số build đầy đủ của Orbita đã tải; bản chưa tải dùng <major>.0.0.0', async () => {
  const { resolveOrbitaFullVersion } = await import('../src/gologin-profile/resolve-orbita-full-version.mjs');
  const { mkdirSync } = await import('node:fs');
  const root = join(directory, 'orbita-root');
  const contents = join(root, 'orbita-browser-152', 'Orbita-Browser.app', 'Contents');
  mkdirSync(contents, { recursive: true });
  writeFileSync(join(contents, 'Info.plist'), '<?xml version="1.0"?><plist><dict><key>CFBundleShortVersionString</key>\n<string>152.0.7977.82</string></dict></plist>');
  assert.equal(await resolveOrbitaFullVersion('152', root), '152.0.7977.82');
  assert.equal(await resolveOrbitaFullVersion('153', root), '153.0.0.0');
});

test('mở 10 luồng GoLogin song song, không chờ từng phiên mở xong; mỗi luồng slot/IP riêng', async () => {
  let running = 0, peak = 0, ip = 120;
  const opened = [];
  const { launchGoLoginBrowsers } = await loadFixtureModule('src/browser/actions/launch-gologin-browsers.mjs', {
    waitForStableProxyIp: async (proxy, probe) => probe(),
    fetchProxyGeo: async () => null,
    pickGoLoginDeviceHardware: async () => null,
    readGoLoginConfig: async () => ({ token: 'fixture-token' }), saveAutoRefillSettings: async () => {},
    readProxyUsageHistory: async () => ({ version: 1, proxies: {} }), persistProxyUsageHistory: async () => {}, saveProxyQueue: async () => {},
    checkProxyExitIp: async () => `192.0.2.${++ip}`, createGoLoginProfile: async () => `profile-${ip}`, deleteGoLoginProfile: async () => true,
    openGoLoginBrowser: async options => {
      running++; peak = Math.max(peak, running);
      await new Promise(resolve => setTimeout(resolve, 30));
      running--;
      const session = { ...options, isGoLogin: true, exitIp: options.verifiedExitIp }; activeBrowsers.add(session); opened.push(session); return session;
    }
  });
  const started = Date.now();
  await launchGoLoginBrowsers(JSON.stringify({ concurrency: 10, websiteUrl: 'https://offer.test/',
    proxyList: Array.from({ length: 10 }, (_, index) => `127.0.0.1:${9900 + index}`).join('\n') }));
  assert.equal(opened.length, 10);
  assert.equal(peak, 10, 'cả 10 phiên cùng khởi chạy');
  assert.ok(Date.now() - started < 250, 'không chờ tuần tự 10 × 30ms');
  assert.deepEqual(opened.map(session => session.slot).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(new Set(opened.map(session => session.exitIp)).size, 10);
});

test('tắt app: dừng Orbita + xóa profile mọi phiên GoLogin, chặn bù, quét profile app còn sót', async () => {
  const stopped = [], sweeps = [];
  const { shutdownGoLoginSessions } = await loadFixtureModule('src/process/actions/shutdown-gologin-sessions.mjs', {
    requestManagedProfileStop: async session => { stopped.push(session.profileId); },
    readGoLoginConfig: async () => ({ token: 'fixture-token' }),
    deleteAppGoLoginProfiles: async token => { sweeps.push(token); return { deleted: 2, failed: 0 }; }
  });
  autoRefill.enabled = true;
  activeBrowsers.add({ isGoLogin: true, profileId: 'a' }); activeBrowsers.add({ isGoLogin: true, profileId: 'b' }); activeBrowsers.add({ profileId: 'chrome' });
  const result = await shutdownGoLoginSessions();
  assert.deepEqual(stopped.sort(), ['a', 'b']);
  assert.deepEqual(sweeps, ['fixture-token']);
  assert.deepEqual(result, { stopped: 2, deleted: 2, failed: 0 });
  assert.equal(autoRefill.stopRequested, true);
  assert.equal(autoRefill.enabled, false);
  assert.ok([...activeBrowsers].filter(session => session.isGoLogin).every(session => session.suppressAutoRefill));
});

test('quét profile chỉ xóa profile do AutoLeadPC tạo, giữ profile khác và profile đang dùng', async () => {
  const { deleteAppGoLoginProfiles } = await import('../src/gologin-profile/delete-app-gologin-profiles.mjs');
  const deleted = [];
  const request = async (url, options = {}) => {
    if (options.method === 'DELETE') { deleted.push(url.split('/').pop()); return { ok: true }; }
    return { ok: true, json: async () => ({ profiles: [
      { id: 'app-old', notes: 'AutoLeadPC Mac • Windows 10 • Chrome 150 • IP: 1.2.3.4' },
      { id: 'app-live', notes: 'AutoLeadPC Mac • Android • Chrome 151 • IP: 5.6.7.8' },
      { id: 'personal', notes: 'tài khoản cá nhân' }, { id: 'no-notes' }
    ] }) };
  };
  assert.deepEqual(await deleteAppGoLoginProfiles('token', new Set(['app-live']), request), { deleted: 1, failed: 0 });
  assert.deepEqual(deleted, ['app-old']);
  assert.deepEqual(await deleteAppGoLoginProfiles('', new Set(), () => assert.fail('không token thì không gọi API')), { deleted: 0, failed: 0 });
});

test('lịch sử proxy: ghi "đang thử" trước khi mở, phiên giữ đúng khoá; kết quả ghi trong lúc mở không bị ghi đè', async () => {
  let store = { version: 1, proxies: {} };
  const started = [];
  const { launchGoLoginBrowsers } = await loadFixtureModule('src/browser/actions/launch-gologin-browsers.mjs', {
    waitForStableProxyIp: async (proxy, probe) => probe(),
    fetchProxyGeo: async () => ({ ip: '192.0.2.71', country: 'US', timezone: 'America/Chicago', ll: [41.8, -87.6], accuracy: 20, languages: 'en' }),
    pickGoLoginDeviceHardware: async () => null,
    readGoLoginConfig: async () => ({ token: 'fixture-token' }), saveAutoRefillSettings: async () => {}, saveProxyQueue: async () => {},
    readProxyUsageHistory: async () => structuredClone(store), persistProxyUsageHistory: async history => { store = structuredClone(history); },
    checkProxyExitIp: async proxy => `192.0.2.${proxy.server.slice(-2)}`,
    createGoLoginProfile: async () => 'fixture-profile', deleteGoLoginProfile: async () => true,
    startGoLoginProfile: async (token, profileId, options) => { started.push(options); return { wsUrl: 'ws://fixture' }; },
    openGoLoginBrowser: async options => {
      assert.equal(store.proxies[options.proxyKey].status, 'attempting', 'Mục lịch sử phải có trước khi mở');
      await options.startProfile();
      // Toffers báo trùng IP ngay lúc mở: recordProxyOutcome ghi vào đúng khoá của phiên.
      store.proxies[options.proxyKey] = { ...store.proxies[options.proxyKey], status: 'duplicate_ip', reason: 'fixture duplicate' };
      const session = { ...options, isGoLogin: true, exitIp: options.verifiedExitIp };
      activeBrowsers.add(session);
      return session;
    }
  });
  await launchGoLoginBrowsers(JSON.stringify({ concurrency: 1, websiteUrl: 'https://offer.test/', proxyList: '127.0.0.1:9471' }));
  const entries = Object.values(store.proxies);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].status, 'duplicate_ip');
  assert.equal(entries[0].exitIp, '192.0.2.71');
  assert.equal(started[0].timezone.timezone, 'America/Chicago', 'SDK nhận múi giờ tra sẵn, không tự tra lại qua proxy');
  activeBrowsers.clear(); activeExitIpLocks.clear(); activeProxyLocks.clear();
});

test('lượt mở lỗi ghi "failed" vào đúng mục của lượt đó và không truyền múi giờ khi tra geo lỗi', async () => {
  let store = { version: 1, proxies: {} };
  const started = [];
  const { launchGoLoginBrowsers } = await loadFixtureModule('src/browser/actions/launch-gologin-browsers.mjs', {
    waitForStableProxyIp: async (proxy, probe) => probe(),
    fetchProxyGeo: async () => null,
    pickGoLoginDeviceHardware: async () => null,
    readGoLoginConfig: async () => ({ token: 'fixture-token' }), saveAutoRefillSettings: async () => {}, saveProxyQueue: async () => {},
    readProxyUsageHistory: async () => structuredClone(store), persistProxyUsageHistory: async history => { store = structuredClone(history); },
    checkProxyExitIp: async () => '192.0.2.72',
    createGoLoginProfile: async () => 'fixture-profile', deleteGoLoginProfile: async () => true,
    startGoLoginProfile: async (token, profileId, options) => { started.push(options); return { wsUrl: 'ws://fixture' }; },
    openGoLoginBrowser: async options => { await options.startProfile(); throw new Error('fixture open failed'); }
  });
  await launchGoLoginBrowsers(JSON.stringify({ concurrency: 1, websiteUrl: 'https://offer.test/', proxyList: '127.0.0.1:9472' }));
  const [entry] = Object.values(store.proxies);
  assert.equal(entry.status, 'failed');
  assert.equal(entry.reason, 'fixture open failed');
  assert.equal('timezone' in started[0], false);
  activeBrowsers.clear(); activeExitIpLocks.clear(); activeProxyLocks.clear();
});

test('đọc fingerprint Orbita trúng lúc trang offer đang chuyển hướng thì đợi trang mới và đọc lại', async () => {
  const { readGoLoginDeviceFingerprint } = await import('../src/browser/gologin/read-device-fingerprint.mjs');
  let calls = 0, waits = 0;
  const mainPage = {
    evaluate: async () => {
      if (++calls === 1) throw new Error('page.evaluate: Execution context was destroyed, most likely because of a navigation');
      return { platform: 'Win32', userAgent: 'fixture UA', touchPoints: 0, uaPlatform: 'Windows', uaPlatformVersion: '10.0.0', uaMobile: false };
    },
    waitForLoadState: async () => { waits++; }
  };
  const fingerprint = await readGoLoginDeviceFingerprint({ mainPage, _cdpBrowser: { version: () => '152.0.7977.82' } }, { profileOs: 'win' });
  assert.equal(calls, 2);
  assert.equal(waits, 1);
  assert.equal(fingerprint.platform, 'Win32');
  await assert.rejects(readGoLoginDeviceFingerprint({ mainPage: { evaluate: async () => { throw new Error('Target closed'); } } }, null), /Target closed/);
});

test('slot mở quá 3 phút bị bỏ: lượt bù kết thúc, slot khác vẫn mở; phiên mở muộn bị dừng và xoá profile', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const flush = async () => { for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve)); };
  const deleted = [];
  let releaseStuck;
  const { launchGoLoginBrowsers } = await loadFixtureModule('src/browser/actions/launch-gologin-browsers.mjs', {
    waitForStableProxyIp: async (proxy, probe) => probe(),
    fetchProxyGeo: async () => null,
    pickGoLoginDeviceHardware: async () => null,
    readGoLoginConfig: async () => ({ token: 'fixture-token' }), saveAutoRefillSettings: async () => {}, saveProxyQueue: async () => {},
    readProxyUsageHistory: async () => ({ version: 1, proxies: {} }), persistProxyUsageHistory: async () => {},
    checkProxyExitIp: async proxy => `192.0.2.${proxy.server.slice(-2)}`,
    createGoLoginProfile: async (token, request) => `profile-${request.name.match(/^Slot (\d+)/)[1]}`,
    deleteGoLoginProfile: async (token, profileId) => { deleted.push(profileId); return true; },
    openGoLoginBrowser: async options => {
      if (options.slot === 1) {
        // Kẹt ở chỗ không có timeout; khi chạy tiếp thì openGoLoginBrowser thật kiểm shouldAbort và ném lỗi.
        await new Promise(resolve => { releaseStuck = resolve; });
        if (options.shouldAbort()) throw Object.assign(new Error('fixture late open'), { code: 'GOLOGIN_SLOT_TIMEOUT' });
      }
      const session = { ...options, isGoLogin: true, exitIp: options.verifiedExitIp };
      activeBrowsers.add(session);
      return session;
    }
  });
  const launching = launchGoLoginBrowsers(JSON.stringify({ concurrency: 2, websiteUrl: 'https://offer.test/', proxyList: '127.0.0.1:9481\n127.0.0.1:9482' }));
  await flush();
  assert.equal(typeof releaseStuck, 'function', 'slot 1 phải đang kẹt');
  t.mock.timers.tick(180_000);
  const result = await launching;
  assert.equal([...activeBrowsers].filter(session => session.isGoLogin).length, 1, 'slot 2 vẫn mở bình thường');
  assert.match(result.warnings.join('\n'), /Slot 1 mở quá 3 phút, kẹt ở pha profile_create/);
  assert.equal(activeProxyLocks.size > 0, true, 'proxy của slot kẹt vẫn bị khoá khi lượt kẹt chưa kết thúc');
  releaseStuck();
  await flush();
  assert.deepEqual(deleted, ['profile-1'], 'phiên mở muộn bị xoá profile');
  assert.equal([...activeBrowsers].some(session => session.slot === 1), false);
  activeBrowsers.clear(); activeExitIpLocks.clear(); activeProxyLocks.clear();
});

test('GoLogin nhận ô Chờ tối đa (phút) để tự tắt phiên chạy quá lâu', async () => {
  const { launchGoLoginBrowsers, opened } = await createLauncherFixture();
  await launchGoLoginBrowsers(JSON.stringify({ concurrency: 1, websiteUrl: 'https://offer.test/', proxyList: '127.0.0.1:9491', maxRunMinutes: 10 }));
  assert.equal(opened[0].maxRunMinutes, 10);
  activeBrowsers.clear(); activeExitIpLocks.clear(); activeProxyLocks.clear();
});

test('GoLogin như Chrome: tiến độ lead sau khi có lead, AI bỏ qua trang không có form, AI dùng email của phiên', async () => {
  const calls = [], progress = [], ai = [];
  const { attachGoLoginAutofill } = await loadFixtureModule('src/browser/gologin/attach-autofill.mjs', {
    attachAutofill: (...args) => calls.push(args), startLeadVerification: () => {},
    recordConfirmedLeadProgress: (...args) => progress.push(args),
    runAiAssist: async (page, record) => { ai.push(record); }, resumeAutofillAfterAi: () => {}
  });
  const session = { browser: {}, mainPage: { _assignedRecord: { email: 'lead@example.invalid', firstName: 'A' } }, websiteUrl: 'https://offer.test/', assignedEmail: 'queue@example.invalid' };
  attachGoLoginAutofill(session, [], { enabled: false }, true);
  const options = calls[0][4];
  options.onScreenAdvanced(session, 4, 2);
  options.onPageJump(session, 3);
  assert.deepEqual(progress, [[session, 2, 4], [session, 3]]);
  const page = url => ({ url: () => url, isClosed: () => false, _assignedRecord: session.mainPage._assignedRecord });
  options.onStuck(page('https://toffers.top/click/?key=1'));
  options.onStuck(page('about:blank'));
  assert.equal(ai.length, 0, 'không gọi AI trên link click toffers hoặc trang trống');
  const formPage = page('https://offer.test/form');
  options.onStuck(formPage);
  options.onStuck(formPage);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ai.length, 1, 'không gọi AI dồn cho cùng URL trong 4 giây');
  assert.equal(ai[0].email, 'queue@example.invalid');
  assert.equal(ai[0].firstName, 'A');
  assert.equal(session.mainPage._assignedRecord.email, 'lead@example.invalid', 'không sửa record gốc');
});

test('GoLogin lấy email trong hàng email cho mỗi phiên và truyền Complete text vào runtime', async () => {
  let runtimeOptions;
  const connected = createBrowserFixture();
  const { openGoLoginBrowser } = await loadFixtureModule('src/browser/actions/open-gologin-browser.mjs', {
    connectGoLoginProfile: async () => connected, verifyGoLoginProfileIp: async () => '192.0.2.61',
    configureGoLoginWindow: async () => {}, takeNextEmail: async () => 'queue@example.invalid',
    initializeGoLoginRuntime: async (session, options) => { runtimeOptions = options; },
    recordGoLoginDeviceFingerprint: async () => {}
  });
  const session = await openGoLoginBrowser({ slot: 1, profileId: 'fixture-email', proxy: { server: 'socks5://127.0.0.1:9999' },
    verifiedExitIp: '192.0.2.61', websiteUrl: 'https://offer.test/', startProfile: async () => {}, stopProfile: async () => {},
    completeText: 'Thank you', dataSaver: false });
  assert.equal(session.assignedEmail, 'queue@example.invalid');
  assert.equal(runtimeOptions.completeText, 'Thank you');
  activeBrowsers.clear();
});

test('GoLogin như Chrome: đạt Giới hạn phiên hoàn tất thì không mở thêm; Complete text truyền xuống phiên', async () => {
  const { applicationState } = await import('../src/runtime/application-state.mjs');
  const saved = { max: applicationState.limitRunMax, count: applicationState.limitRunCount };
  try {
    applicationState.limitRunCount = 3;
    const blocked = await createLauncherFixture();
    const result = await blocked.launchGoLoginBrowsers(JSON.stringify({ concurrency: 1, websiteUrl: 'https://offer.test/', proxyList: '127.0.0.1:9501', limitRun: 3 }));
    assert.equal(blocked.opened.length, 0);
    assert.match(result.warnings.join('\n'), /Đã đạt giới hạn 3 phiên hoàn tất/);
    applicationState.limitRunCount = 0;
    const open = await createLauncherFixture();
    await open.launchGoLoginBrowsers(JSON.stringify({ concurrency: 1, websiteUrl: 'https://offer.test/', proxyList: '127.0.0.1:9502', limitRun: 3, completeText: ' Thank you ' }));
    assert.equal(open.opened[0].completeText, 'Thank you');
  } finally {
    applicationState.limitRunMax = saved.max;
    applicationState.limitRunCount = saved.count;
    activeBrowsers.clear(); activeExitIpLocks.clear(); activeProxyLocks.clear();
  }
});

test('GoLogin như Chrome: proxy HTTP có auth đi qua relay đếm byte; mở lỗi thì đóng relay và ghi byte; SOCKS5 giữ nguyên', async () => {
  const relays = [], usage = [], profiles = [], opened = [];
  const base = {
    fetchProxyGeo: async () => null, pickGoLoginDeviceHardware: async () => null,
    readGoLoginConfig: async () => ({ token: 'fixture-token' }), saveAutoRefillSettings: async () => {}, saveProxyQueue: async () => {},
    readProxyUsageHistory: async () => ({ version: 1, proxies: {} }), persistProxyUsageHistory: async () => {},
    checkProxyExitIp: async proxy => `192.0.2.${proxy.server.slice(-2)}`,
    createGoLoginProfile: async (token, request) => { profiles.push(request.proxy); return `profile-${profiles.length}`; },
    deleteGoLoginProfile: async () => true,
    startAuthenticatedHttpRelay: async proxy => {
      const relay = { upstream: proxy, proxy: { server: `http://127.0.0.1:${40000 + relays.length}` }, closed: false,
        readBytes: () => ({ up: 10, down: 90, hosts: {} }), close: async () => { relay.closed = true; } };
      relays.push(relay);
      return relay;
    },
    recordRelayUsage: snapshot => usage.push(snapshot)
  };
  const failing = await loadFixtureModule('src/browser/actions/launch-gologin-browsers.mjs', {
    waitForStableProxyIp: async (proxy, probe) => probe(), ...base,
    openGoLoginBrowser: async options => { opened.push(options); throw new Error('fixture open failed'); } });
  await failing.launchGoLoginBrowsers(JSON.stringify({ concurrency: 1, websiteUrl: 'https://offer.test/', proxyType: 'http', proxyList: 'gw.test:9511:user:secret' }));
  assert.equal(relays.length, 1);
  assert.deepEqual({ mode: profiles[0].mode, host: profiles[0].host, port: profiles[0].port, username: profiles[0].username }, { mode: 'http', host: '127.0.0.1', port: 40000, username: undefined }, 'profile trỏ vào relay, không chứa mật khẩu proxy');
  assert.equal(opened[0].relay, relays[0]);
  assert.equal(opened[0].proxy.username, 'user', 'phiên vẫn giữ proxy gốc để khoá/kiểm IP');
  assert.equal(relays[0].closed, true);
  assert.deepEqual(usage, [{ up: 10, down: 90, hosts: {} }]);

  const socks = await loadFixtureModule('src/browser/actions/launch-gologin-browsers.mjs', {
    waitForStableProxyIp: async (proxy, probe) => probe(), ...base,
    openGoLoginBrowser: async options => { opened.push(options); const session = { ...options, isGoLogin: true, exitIp: options.verifiedExitIp }; activeBrowsers.add(session); return session; } });
  await socks.launchGoLoginBrowsers(JSON.stringify({ concurrency: 1, websiteUrl: 'https://offer.test/', proxyType: 'socks5', proxyList: 'gw.test:9512:user:secret' }));
  assert.equal(relays.length, 1, 'SOCKS5 không qua relay (Chrome cũng không đếm byte SOCKS5)');
  assert.equal(profiles[1].mode, 'socks5');
  assert.equal(opened[1].relay, null);
  activeBrowsers.clear(); activeExitIpLocks.clear(); activeProxyLocks.clear();
});

test('GoLogin dừng phiên, không mở offer khi Orbita ra Internet bằng IP thật của Mac', async () => {
  setMacPublicIpLookup(async () => '192.0.2.71');
  try {
    let runtimeStarted = false;
    const connected = createBrowserFixture();
    const { openGoLoginBrowser } = await loadFixtureModule('src/browser/actions/open-gologin-browser.mjs', {
      connectGoLoginProfile: async () => connected, verifyGoLoginProfileIp: async () => '192.0.2.71',
      configureGoLoginWindow: async () => {}, takeNextEmail: async () => null,
      initializeGoLoginRuntime: async () => { runtimeStarted = true; }
    });
    await assert.rejects(openGoLoginBrowser({ slot: 1, profileId: 'fixture-mac-ip', proxy: { server: 'http://127.0.0.1:9999' },
      verifiedExitIp: '192.0.2.71', websiteUrl: 'https://offer.test/', startProfile: async () => {}, stopProfile: async () => {}, dataSaver: false }),
      error => error.code === 'MAC_IP_EXPOSED');
    assert.equal(runtimeStarted, false, 'không mở offer');
    assert.equal(activeBrowsers.size, 0);
  } finally {
    setMacPublicIpLookup(async () => '203.0.113.250');
    activeBrowsers.clear();
  }
});

test('xác minh IP trong Orbita trả geo của chính IP đó, kể cả khi IP lệch IP kiểm trước', async () => {
  const pages = [];
  const context = { newPage: async () => {
    const page = { goto: async url => ({ ok: () => url === 'https://geo.myip.link' }), locator: () => ({ innerText: async () => JSON.stringify({ ip: '192.0.2.81', timezone: 'America/New_York', ll: [40.7, -74], country: 'US', accuracy: 50 }) }),
      evaluate: async () => null, close: async () => {} };
    pages.push(page);
    return page;
  } };
  let geo;
  assert.equal(await verifyGoLoginProfileIp(context, '192.0.2.81', () => {}, value => { geo = value; }), '192.0.2.81');
  assert.equal(geo.timezone, 'America/New_York');
  geo = null;
  await assert.rejects(verifyGoLoginProfileIp(context, '192.0.2.80', () => {}, value => { geo = value; }), error => error.code === 'GOLOGIN_IP_MISMATCH' && error.detectedIp === '192.0.2.81');
  assert.equal(geo.ip, '192.0.2.81', 'geo đi kèm đúng IP Orbita thấy để dùng khi nhận IP mới');
});

test('GoLogin: múi giờ lệch IP app thì khởi động lại Orbita đúng múi giờ; tên profile theo đúng IP app', async () => {
  const NY = { ip: '192.0.2.82', timezone: 'America/New_York', ll: [40.7, -74], country: 'US' };
  for (const [launchZone, expectRestarts] of [['America/Chicago', 1], ['America/New_York', 0]]) {
    const renamed = [], starts = [];
    let stops = 0;
    const { openGoLoginBrowser } = await loadFixtureModule('src/browser/actions/open-gologin-browser.mjs', {
      connectGoLoginProfile: async startProfile => {
        const started = await startProfile();
        const connected = createBrowserFixture();
        connected.gl._tz = started.tz;
        return connected;
      },
      verifyGoLoginProfileIp: async (context, expected, onHints, onGeo) => { onGeo(NY); return NY.ip; },
      configureGoLoginWindow: async () => {}, takeNextEmail: async () => null, initializeGoLoginRuntime: async () => {}, recordGoLoginDeviceFingerprint: async () => {}
    });
    const session = await openGoLoginBrowser({ slot: 1, profileId: 'fixture-geo', proxy: { server: 'http://127.0.0.1:9999' }, verifiedExitIp: NY.ip,
      websiteUrl: 'https://offer.test/', dataSaver: false, stopProfile: async () => { stops++; },
      startProfile: async appGeo => { starts.push(appGeo?.timezone || 'lúc tạo'); return { tz: appGeo || { timezone: launchZone, country: 'US' } }; },
      renameProfile: async ip => { renamed.push(ip); return true; } });
    assert.equal(starts.length - 1, expectRestarts, `khởi động ${launchZone}`);
    if (expectRestarts) {
      assert.deepEqual(starts, ['lúc tạo', 'America/New_York'], 'khởi động lại đúng múi giờ của IP app');
      assert.equal(stops, 1, 'dừng Orbita cũ trước khi khởi động lại');
      assert.ok(session.logs.some(log => log.type === 'gologin_geo_restart'));
    }
    assert.deepEqual(renamed, [NY.ip], 'tên profile GoLogin ghi đúng IP app');
    session.exitIp = '192.0.2.83';
    await session.onExitIpChanged(session.exitIp);
    assert.deepEqual(renamed, [NY.ip, '192.0.2.83'], 'IP phiên đổi thì đổi tên theo');
    activeBrowsers.clear();
  }
});

test('GoLogin: múi giờ vẫn lệch sau 3 lần khởi động lại thì bỏ proxy, không mở offer', async () => {
  let starts = 0, runtime = false;
  const { openGoLoginBrowser } = await loadFixtureModule('src/browser/actions/open-gologin-browser.mjs', {
    connectGoLoginProfile: async startProfile => { await startProfile(); const connected = createBrowserFixture(); connected.gl._tz = { timezone: 'America/Chicago' }; return connected; },
    verifyGoLoginProfileIp: async (context, expected, onHints, onGeo) => { onGeo({ ip: '192.0.2.86', timezone: 'America/New_York', ll: [0, 0] }); return '192.0.2.86'; },
    configureGoLoginWindow: async () => {}, takeNextEmail: async () => null, initializeGoLoginRuntime: async () => { runtime = true; }
  });
  await assert.rejects(openGoLoginBrowser({ slot: 1, profileId: 'fixture-geo-fail', proxy: { server: 'http://127.0.0.1:9999' }, verifiedExitIp: '192.0.2.86',
    websiteUrl: 'https://offer.test/', dataSaver: false, stopProfile: async () => {}, startProfile: async () => { starts++; return {}; } }),
    error => error.code === 'GOLOGIN_GEO_MISMATCH');
  assert.equal(starts, 4, 'lần đầu + 3 lần khởi động lại');
  assert.equal(runtime, false);
  assert.equal(activeBrowsers.size, 0);
});

test('profile GoLogin tạo ra chưa ghi IP; đổi tên gọi PATCH /browser/{id}/name', async () => {
  const { buildGoLoginProfileRequest, buildGoLoginProfileName } = await import('../src/gologin-profile/build-gologin-profile-request.mjs');
  const { renameGoLoginProfile } = await import('../src/gologin-profile/rename-gologin-profile.mjs');
  const request = buildGoLoginProfileRequest({ slot: 3, exitIp: '192.0.2.84', deviceProfile: 'windows', browserVersion: '152.0.7977.82' });
  assert.equal(request.name, 'Slot 3 • [Windows 10] Chrome 152 • đang xác minh IP');
  assert.equal(request.notes.includes('192.0.2.84'), false);
  assert.ok(request.notes.startsWith('AutoLeadPC Mac •'), 'giữ tiền tố để dọn profile của app');
  assert.equal(buildGoLoginProfileName({ slot: 3, osLabel: 'Windows 10', versionNum: '152', ip: '192.0.2.85' }), 'Slot 3 • [Windows 10] Chrome 152 • 192.0.2.85');
  const calls = [];
  assert.equal(await renameGoLoginProfile('fixture-token', 'abc', 'Tên mới', async (url, options) => { calls.push({ url, method: options.method, body: JSON.parse(options.body) }); return { ok: true }; }), true);
  assert.deepEqual(calls, [{ url: 'https://api.gologin.com/browser/abc/name', method: 'PATCH', body: { name: 'Tên mới' } }]);
});

/**
 * IP mới phải cập nhật title ngay và tên profile sau cùng phải theo IP mới nhất dù PATCH cũ chậm.
 * @return {Promise<void>} Các request đổi tên được tuần tự hóa và hiển thị dùng IP phiên hiện tại.
 * @throws {AssertionError} Khi tên cũ có thể ghi đè tên mới hoặc bỏ qua cập nhật hiển thị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
async function serializesGoLoginNameUpdates() {
  const connected = createBrowserFixture();
  const renamed = [], displayed = [];
  let completeInitialRename;
  const initialRename = new Promise(resolve => { completeInitialRename = resolve; });
  const { openGoLoginBrowser } = await loadFixtureModule('src/browser/actions/open-gologin-browser.mjs', {
    connectGoLoginProfile: async () => connected,
    verifyGoLoginProfileIp: async () => '192.0.2.120',
    configureGoLoginWindow: async () => {}, initializeGoLoginRuntime: async () => {},
    decorateGoLoginPages: async session => { displayed.push(session.exitIp); }
  });
  const session = await openGoLoginBrowser({ slot: 1, profileId: 'rename-order-fixture',
    proxy: { server: 'http://127.0.0.1:9999' }, verifiedExitIp: '192.0.2.120', websiteUrl: 'https://offer.test/',
    stopProfile: async () => {}, renameProfile: async ip => { renamed.push(ip); return renamed.length === 1 ? initialRename : true; } });
  session.exitIp = '192.0.2.121';
  const updating = session.onExitIpChanged(session.exitIp);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(renamed, ['192.0.2.120'], 'Đợi PATCH cũ xong trước khi gửi PATCH mới');
  assert.deepEqual(displayed, ['192.0.2.121'], 'Title/bar không phải chờ PATCH cũ');
  completeInitialRename(true);
  await updating;
  assert.deepEqual(renamed, ['192.0.2.120', '192.0.2.121']);
}
test('đồng bộ IP hiển thị và thứ tự đổi tên GoLogin khi request cũ phản hồi chậm', serializesGoLoginNameUpdates);

test('geo proxy: geo.myip.link lỗi thì dựng múi giờ/toạ độ/ngôn ngữ từ dịch vụ dự phòng, SDK không phải tự tra (Proxy Error)', async () => {
  const { fetchProxyGeo } = await import('../src/gologin-profile/fetch-proxy-geo.mjs');
  const fallback = await fetchProxyGeo({}, async () => ({ ip: '192.0.2.90', country: 'US', timezone: 'America/Chicago', loc: '41.8,-87.6' }));
  assert.deepEqual({ ...fallback, ll: [...fallback.ll] }, { ip: '192.0.2.90', country: 'US', timezone: 'America/Chicago', loc: '41.8,-87.6', ll: [41.8, -87.6], accuracy: 100, languages: 'en' });
  const full = await fetchProxyGeo({}, async () => ({ ip: '192.0.2.91', country: 'VN', timezone: 'Asia/Ho_Chi_Minh', ll: [10.8, 106.6], accuracy: 20, languages: 'vi' }));
  assert.equal(full.languages, 'vi');
  assert.equal(await fetchProxyGeo({}, async () => ({ ip: '192.0.2.92' })), null, 'thiếu múi giờ thì không dùng');
  assert.equal(await fetchProxyGeo({}, async () => { throw new Error('dead'); }), null);
});

test('dòng proxy chết hoặc mở lỗi bị chuyển sang đã dùng (không thử lại mãi); hết hạn mức profile thì giữ dòng', async () => {
  const { proxyQueue } = await import('../src/runtime/constants/proxy-queue.mjs');
  const saved = { available: [...proxyQueue.available], used: [...proxyQueue.used] };
  const base = {
    fetchProxyGeo: async () => null, pickGoLoginDeviceHardware: async () => null,
    readGoLoginConfig: async () => ({ token: 'fixture-token' }), saveAutoRefillSettings: async () => {}, saveProxyQueue: async () => {},
    readProxyUsageHistory: async () => ({ version: 1, proxies: {} }), persistProxyUsageHistory: async () => {},
    createGoLoginProfile: async () => 'fixture-profile', deleteGoLoginProfile: async () => true
  };
  try {
    proxyQueue.available.splice(0, Infinity, '127.0.0.1:9601', '127.0.0.1:9602', '127.0.0.1:9603');
    proxyQueue.used.splice(0, Infinity);
    const failing = await loadFixtureModule('src/browser/actions/launch-gologin-browsers.mjs', { ...base,
      waitForStableProxyIp: async proxy => proxy.server.endsWith('9601') ? null : { ip: `192.0.2.${proxy.server.slice(-2)}`, geo: null },
      checkProxyExitIp: async () => null,
      openGoLoginBrowser: async () => { throw new Error('Proxy Error. '); } });
    await failing.launchGoLoginBrowsers(JSON.stringify({ concurrency: 1, websiteUrl: 'https://offer.test/' }));
    assert.deepEqual([...proxyQueue.used], ['127.0.0.1:9601', '127.0.0.1:9602'], 'dòng chết và dòng mở lỗi đều bị bỏ');
    assert.deepEqual([...proxyQueue.available], ['127.0.0.1:9603']);
    activeExitIpLocks.clear(); activeProxyLocks.clear();
    const limited = await loadFixtureModule('src/browser/actions/launch-gologin-browsers.mjs', { ...base,
      waitForStableProxyIp: async proxy => ({ ip: `192.0.2.${proxy.server.slice(-2)}`, geo: null }),
      checkProxyExitIp: async () => null,
      createGoLoginProfile: async () => { throw Object.assign(new Error('HTTP 403'), { code: 'GOLOGIN_PROFILE_LIMIT' }); },
      openGoLoginBrowser: async () => assert.fail('không được mở') });
    await limited.launchGoLoginBrowsers(JSON.stringify({ concurrency: 1, websiteUrl: 'https://offer.test/' }));
    assert.deepEqual([...proxyQueue.available], ['127.0.0.1:9603'], 'lỗi hạn mức profile không phải lỗi proxy: giữ dòng');
  } finally {
    proxyQueue.available.splice(0, Infinity, ...saved.available);
    proxyQueue.used.splice(0, Infinity, ...saved.used);
    activeBrowsers.clear(); activeExitIpLocks.clear(); activeProxyLocks.clear();
  }
});

test('proxy ra cả IPv6 lẫn IPv4: IP chính của phiên là IPv4 (IP toffers thấy), IPv6 báo làm IP phụ; proxy chỉ IPv6 thì giữ IPv6', async () => {
  const IP6 = '2601:100:8000:91:597c:332b:9d23:54bc';
  /**
   * Context giả: geo.myip.link trả IPv6 (dual-stack); api.ipify.org chỉ IPv4 — `ipv4` null nghĩa là proxy chỉ có IPv6.
   * @return {object} Context Orbita giả.
   */
  const contextWith = ipv4 => ({ newPage: async () => {
    let current = '';
    return {
      goto: async url => { current = url; return { ok: () => url === 'https://geo.myip.link' || (url.startsWith('https://api.ipify.org') && Boolean(ipv4)) }; },
      locator: () => ({ innerText: async () => current === 'https://geo.myip.link'
        ? JSON.stringify({ ip: IP6, timezone: 'America/New_York', ll: [40.7, -74], country: 'US' })
        : JSON.stringify({ ip: ipv4 }) }),
      evaluate: async () => null, close: async () => {}
    };
  } });
  let geo = null, alternate = null;
  assert.equal(await verifyGoLoginProfileIp(contextWith('198.51.100.91'), '198.51.100.91', () => {}, value => { geo = value; }, value => { alternate = value; }), '198.51.100.91',
    'IP chính là IPv4, khớp IP app kiểm proxy nên không báo lệch');
  assert.equal(alternate, IP6, 'IPv6 vẫn được báo để tính khi kiểm lead/khoá trùng');
  assert.equal(geo.timezone, 'America/New_York', 'vẫn giữ geo để khớp múi giờ');
  alternate = null;
  assert.equal(await verifyGoLoginProfileIp(contextWith(null), IP6, () => {}, () => {}, value => { alternate = value; }), IP6, 'proxy chỉ có IPv6 thì giữ IPv6');
  assert.equal(alternate, null);
  await assert.rejects(verifyGoLoginProfileIp(contextWith('198.51.100.92'), '198.51.100.91', () => {}, () => {}, () => {}),
    error => error.code === 'GOLOGIN_IP_MISMATCH' && error.detectedIp === '198.51.100.92', 'so lệch IP theo IPv4');
});

test('phiên GoLogin dual-stack: hiển thị/kiểm lead theo IPv4, IPv6 nằm trong IP phụ của phiên', async () => {
  const IP6 = '2601:100:8000:91:597c:332b:9d23:54bc';
  const connected = createBrowserFixture();
  const { openGoLoginBrowser } = await loadFixtureModule('src/browser/actions/open-gologin-browser.mjs', {
    connectGoLoginProfile: async () => connected,
    verifyGoLoginProfileIp: async (context, expected, onHints, onGeo, onAlternate) => { onAlternate(IP6); return '198.51.100.93'; },
    configureGoLoginWindow: async () => {}, takeNextEmail: async () => null, initializeGoLoginRuntime: async () => {}, recordGoLoginDeviceFingerprint: async () => {}
  });
  const session = await openGoLoginBrowser({ slot: 1, profileId: 'fixture-dual', proxy: { server: 'http://127.0.0.1:9999' }, verifiedExitIp: '198.51.100.93',
    websiteUrl: 'https://offer.test/', dataSaver: false, startProfile: async () => ({}), stopProfile: async () => {} });
  assert.equal(session.exitIp, '198.51.100.93', 'IP hiển thị trên bảng/log là IPv4');
  assert.ok(session.exitIps.has('198.51.100.93') && session.exitIps.has(IP6), 'kiểm lead theo cả IPv4 lẫn IPv6');
  assert.ok(session.logs.some(log => log.type === 'session_exit_ip_observed' && String(log.detail).includes(IP6)), 'log ghi IPv6 là IP phụ');
  activeBrowsers.clear();
});
