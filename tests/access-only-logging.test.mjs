import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';

const directory = mkdtempSync(join(homedir(), 'Library/Application Support/AutoLeadPC-tests-access-'));
process.env.AUTOLEADPC_DATA_DIR = basename(directory);
process.env.AUTOLEADPC_LOG_MODE = 'access';
process.env.AUTOLEADPC_FULL_HTML_DEBUG = '1';
const { attachBrowserLogger } = await import('../src/browser/actions/attach-browser-logger.mjs');
const { installAccessOnlyConsole } = await import('../src/logging/install-access-only-console.mjs');
const { startManualOpsRecorder } = await import('../src/observer/start-manual-ops-recorder.mjs');
const { savePersistedBrowserLogs, persistedBrowserLogs } = await import('../src/logging/browser-logs.mjs');
const { moduleState } = await import('../src/logging/browser-logs/state/module-state.mjs');
const { isFullHtmlDebugEnabled } = await import('../src/logging/html-capture/is-full-html-debug-enabled.mjs');
test.after(async () => { clearTimeout(moduleState.saveBrowserLogsTimer); await savePersistedBrowserLogs(); rmSync(directory, { recursive: true, force: true }); });

test('không log trang vào được; chỉ giữ một lỗi mở trang, bỏ probe/redirect, thao tác, iframe, AI và reload', async t => {
  const output = [];
  t.mock.method(console, 'log', (...values) => output.push(values));
  const context = new EventEmitter();
  const page = new EventEmitter();
  let url = 'about:blank';
  page.url = () => url;
  page.mainFrame = () => page;
  page.isClosed = () => false;
  context.pages = () => [page];
  const session = { slot: 1 };
  attachBrowserLogger(context, session);
  const load = (destination, status) => {
    url = destination;
    page.emit('response', { request: () => ({ isNavigationRequest: () => true }), frame: () => page, status: () => status, url: () => url });
    page.emit('domcontentloaded');
  };
  load('https://api.ipify.org/?format=json', 200);
  load('https://toffers.top/click/?token=secret', 302);
  page.emit('response', { request: () => ({ isNavigationRequest: () => true }), frame: () => ({}), status: () => 500, url: () => 'https://iframe.test/' });
  assert.equal(session.logs.length, 0);
  load('https://offer.test/form?email=private@example.invalid#answer', 200);
  for (let index = 0; index < 100; index++) session.addBrowserLog({ type: 'ai_started', detail: 'private field' }, page);
  load('https://offer.test/step2', 200);
  assert.equal(session.logs.length, 0);
  assert.equal(output.length, 0, 'Không in Vào được trang ra console');
  assert.equal(page.listenerCount('pageerror'), 0);
  assert.equal(page.listenerCount('framenavigated'), 0);
  assert.equal(page.listenerCount('console'), 0);
  assert.equal(page.listenerCount('request'), 0);
  const failed = new EventEmitter();
  failed.url = () => 'chrome-error://chromewebdata/';
  failed.mainFrame = () => failed;
  context.emit('page', failed);
  failed.emit('requestfailed', { isNavigationRequest: () => true, frame: () => failed, url: () => 'https://broken.test/?secret=x', failure: () => ({ errorText: 'net::ERR_TUNNEL_CONNECTION_FAILED' }) });
  failed.emit('requestfailed', { isNavigationRequest: () => true, frame: () => failed, url: () => 'https://broken.test/', failure: () => ({ errorText: 'net::ERR_TIMED_OUT' }) });
  assert.equal(session.logs.length, 1);
  assert.equal(session.logs[0].type, 'page_access_failed');
  assert.equal(session.logs[0].url, 'https://broken.test/');
  assert.equal(session.logs[0].tabId, 2);
  assert.equal(output.length, 1);
  context.emit('close');
});

test('observer không gắn script hoặc tạo writer; console chỉ giữ kết quả mở trang và lỗi tiến trình', async () => {
  assert.equal(isFullHtmlDebugEnabled(), false, 'Access thắng cả cờ debug HTML đang bật');
  const recorder = startManualOpsRecorder({ exposeBinding: () => assert.fail('Không gắn recorder') }, {}, directory);
  assert.equal(recorder.filePath, null);
  await recorder.ready;
  const lines = [];
  const output = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map(method => [method, (...values) => lines.push(values)]));
  installAccessOnlyConsole(output);
  installAccessOnlyConsole(output);
  output.log('[AI] repeated'); output.warn('[HTTP] repeated'); output.error('[Autofill] repeated');
  output.log('[PageAccess] Không vào được trang.'); output.error('[Process] fatal');
  output.log('[Lifecycle] lead confirmed');
  assert.equal(lines.length, 3);
});


test('log tối giản giữ IP có lead và lý do đóng app; bỏ query và không ghi lặp khi CDP ngắt sau context', async t => {
  t.mock.method(console, 'log', () => {});
  const context = new EventEmitter();
  const connection = new EventEmitter();
  context.pages = () => [];
  const session = { slot: 8, exitIp: '192.0.2.8', _cdpBrowser: connection };
  attachBrowserLogger(context, session);
  for (let index = 0; index < 100; index++) session.addBrowserLog({ type: 'autofill_scan', detail: 'ignore' });
  assert.equal(session.logs.length, 0);
  session.leadCheckStatus = 'confirmed';
  session.confirmedLeadIp = session.exitIp;
  session.addBrowserLog({ type: 'lead_observed', detail: 'Đã có lead qua theo dõi thụ động.' });
  session.confirmedLeadIp = null; // Giữ bằng chứng lead đã ghi kể cả khi trạng thái runtime bị reset.
  session.addBrowserLog({ type: 'sub_offer_tab_closed', detail: 'Tab phụ: https://offer.test/?email=secret#answer' });
  session.addBrowserLog({ type: 'browser_close_all_requested', detail: 'Lệnh Đóng tất cả.' });
  context.emit('close');
  connection.emit('disconnected');
  assert.equal(session.logs.length, 4);
  const ending = session.logs.at(-1);
  assert.equal(ending.type, 'session_closed');
  assert.equal(ending.closeReasonType, 'browser_close_all_requested');
  assert.equal(ending.confirmedLeadIp, '192.0.2.8');
  assert.equal(ending.ip, '192.0.2.8');
  assert.equal(ending.leadStatus, 'confirmed');
  assert.equal(JSON.stringify(session.logs).includes('secret'), false);
  assert.deepEqual(session.logs.map(event => event.sequence), [1, 2, 3, 4]);
  await savePersistedBrowserLogs();
  const { readFileSync } = await import('node:fs');
  const saved = JSON.parse(readFileSync(join(directory, 'logs/browser-logs.json')));
  const recording = saved.find(item => item.id === session.recordingId);
  assert.equal(recording.closeReasonType, 'browser_close_all_requested');
  assert.equal(recording.confirmedLeadIp, '192.0.2.8');
});

test('mất CDP với IP có lead không bị kết luận nhầm là đóng chủ động; đóng tab phụ không thành lý do đóng browser', t => {
  t.mock.method(console, 'log', () => {});
  const context = new EventEmitter(), connection = new EventEmitter();
  context.pages = () => [];
  const session = { slot: 2, exitIp: '192.0.2.2', confirmedLeadIp: '192.0.2.2', _cdpBrowser: connection };
  attachBrowserLogger(context, session);
  session.addBrowserLog({ type: 'duplicate_tab_closed', detail: 'Chỉ đóng tab trùng.' });
  connection.emit('disconnected');
  context.emit('close');
  assert.equal(session.logs.length, 2);
  assert.equal(session.logs.at(-1).closeReasonType, 'unknown_external_close');
  assert.equal(session.logs.at(-1).confirmedLeadIp, '192.0.2.2');
  assert.match(session.logs.at(-1).detail, /chưa phân biệt/);
  const recording = persistedBrowserLogs.find(item => item.id === session.recordingId);
  assert.ok(recording.endedAt, 'Chốt cả trường hợp chỉ có disconnected');
});


test('tóm tắt nhật ký vẫn giữ IP/lead và lý do đóng sau khi dọn bằng chứng', async () => {
  const { summarizeRecordingSession } = await import('../src/logging/recorder/summarize-recording-session.mjs');
  const recording = summarizeRecordingSession({ logs: [
    { type: 'browser_close_all_requested', detail: 'Đóng toàn bộ.', ip: '192.0.2.1', confirmedLeadIp: '192.0.2.1' },
    { type: 'session_closed', detail: 'Đã đóng.', ip: '192.0.2.1', confirmedLeadIp: '192.0.2.1', closeReasonType: 'browser_close_all_requested' },
  ] }, Date.now());
  assert.equal(recording.logs.length, 2);
  assert.equal(recording.logs[1].confirmedLeadIp, '192.0.2.1');
  assert.equal(recording.logs[1].closeReasonType, 'browser_close_all_requested');
});

test('tóm tắt vẫn giữ pha và mã lỗi GoLogin trước SDK/IP; lỗi cửa sổ không bị bỏ', async t => {
  t.mock.method(console, 'log', () => {});
  const { attachSessionLifecycleLogger } = await import('../src/logging/attach-session-lifecycle-logger.mjs');
  const { summarizeRecordingSession } = await import('../src/logging/recorder/summarize-recording-session.mjs');
  const recording = { slot: 3, logs: [] };
  const log = attachSessionLifecycleLogger(new EventEmitter(), { startupPhase: 'verify_ip', isGoLogin: true }, recording);
  log({ type: 'window_visibility_error', detail: 'fixture hide failed' });
  log({ type: 'gologin_start_failed', reasonCode: 'GOLOGIN_IP_MISMATCH', expectedExitIp: '192.0.2.1', actualExitIp: '192.0.2.2', detail: 'fixture mismatch' });
  const summary = summarizeRecordingSession(recording, Date.now());
  assert.equal(summary.logs.length, 2);
  assert.equal(summary.logs[1].phase, 'verify_ip');
  assert.equal(summary.logs[1].reasonCode, 'GOLOGIN_IP_MISMATCH');
  assert.equal(summary.logs[1].actualExitIp, '192.0.2.2');
});

test('nhật ký phiên giữ lý do autofill chưa chạy và mã lỗi tải trang', async t => {
  t.mock.method(console, 'log', () => {});
  const { attachSessionLifecycleLogger } = await import('../src/logging/attach-session-lifecycle-logger.mjs');
  const recording = { slot: 1, logs: [] };
  const log = attachSessionLifecycleLogger(new EventEmitter(), {}, recording);
  for (const type of ['offer_manual', 'offer_skipped', 'autofill_records_empty']) log({ type });
  log({ type: 'stuck_page_reload_failed', reasonCode: 'navigation_timeout' });
  log({ type: 'autofill_scan' });
  assert.deepEqual(recording.logs.map(event => event.type),
    ['offer_manual', 'offer_skipped', 'autofill_records_empty', 'stuck_page_reload_failed']);
  assert.equal(recording.logs.at(-1).reasonCode, 'navigation_timeout');
  const { summarizeRecordingSession } = await import('../src/logging/recorder/summarize-recording-session.mjs');
  const summary = summarizeRecordingSession(recording, Date.now());
  assert.deepEqual(summary.logs.map(event => event.type), recording.logs.map(event => event.type));
  assert.equal(summary.logs.at(-1).reasonCode, 'navigation_timeout');
});

test('log tối giản giữ mốc phục hồi/tới trần Adsmith để nhìn được nguyên nhân proxy chậm', () => {
  const context = new EventEmitter();
  context.pages = () => [];
  const session = { slot: 1, exitIp: '192.0.2.1' };
  attachBrowserLogger(context, session);
  for (const type of ['adsmith_loading_timeout_reload', 'adsmith_loading_reload_failed', 'iframe_load_exhausted']) session.addBrowserLog({ type, detail: 'Iframe Adsmith cần kiểm tra kết nối.' });
  assert.deepEqual(session.logs.map(event => event.type), ['adsmith_loading_timeout_reload', 'adsmith_loading_reload_failed', 'iframe_load_exhausted']);
  context.emit('close');
});
