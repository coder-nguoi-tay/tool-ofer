import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { existsSync, mkdtempSync } from 'node:fs';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { chromium } from 'playwright';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';

const directory = mkdtempSync(join(homedir(), 'Library/Application Support/AutoLeadPC-tests-recorder-'));
process.env.AUTOLEADPC_DATA_DIR = basename(directory);
const { persistedBrowserLogs, browserSessionLogs, interactionHtmlDirectory, savePersistedBrowserLogs, createBrowserLogsArchive } = await import('../src/logging/browser-logs.mjs');
const { moduleState } = await import('../src/logging/browser-logs/state/module-state.mjs');
const { createRecorderTestServer, waitForRecording } = await import('./helpers/recorder-test-server.mjs');
const { attachBrowserLogger } = await import('../src/browser/actions/attach-browser-logger.mjs');
const { startManualOpsRecorder } = await import('../observer.mjs');
const { captureBrowserSnapshot } = await import('../src/logging/recorder/capture-browser-snapshot.mjs');
const { attachNetworkDiagnostics } = await import('../src/logging/recorder/attach-network-diagnostics.mjs');
const { createLogCoalescer } = await import('../src/logging/recorder/create-log-coalescer.mjs');
const { server, baseUrl } = await createRecorderTestServer();
after(async () => {
  await new Promise(resolve => setTimeout(resolve, 100));
  clearTimeout(moduleState.saveBrowserLogsTimer);
  await savePersistedBrowserLogs();
  await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
});

const legacySession = { id: 'replay-fixture', slot: 2, ip: '198.51.100.10', startedAt: new Date().toISOString(), logs: [{ type: 'submit_clicked', time: new Date().toISOString(), detail: 'Continue' }] };
persistedBrowserLogs.unshift(legacySession);

test('replay API hỗ trợ log cũ, ghi chú gắn đúng bước và JSON xuất giữ đủ nội dung', async () => {
  const replay = await (await fetch(`${baseUrl}/browser-replay/session?sessionId=replay-fixture`)).json();
  assert.equal(replay.events[0].id, 'legacy-0');
  const response = await fetch(`${baseUrl}/browser-replay/feedback`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: legacySession.id, eventId: 'legacy-0', actual: 'Form hiện lại', expected: 'Giữ form đã ẩn <script>window.injected=true</script>' }),
  });
  assert.equal(response.status, 200);
  const exported = await fetch(`${baseUrl}/browser-replay/session?sessionId=replay-fixture&download=1`);
  assert.ok(exported.headers.get('content-disposition').includes('attachment'));
  const data = await exported.json();
  assert.equal(data.session.feedback[0].eventId, 'legacy-0');
  assert.ok(data.session.feedback[0].expected.includes('<script>'));
  assert.equal(data.events.length, 1);
  const onDisk = JSON.parse(await readFile(join(directory, 'logs/browser-logs.json'), 'utf8'));
  assert.equal(onDisk.find(session => session.id === legacySession.id).feedback.length, 1);
});

test('replay từ chối ghi chú thiếu nội dung hoặc tham chiếu sự kiện không tồn tại', async () => {
  for (const [eventId, expected, status] of [['missing', 'Expected', 404], ['legacy-0', '', 400], ['legacy-0', 'x'.repeat(4001), 400]]) {
    const result = await fetch(`${baseUrl}/browser-replay/feedback`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: legacySession.id, eventId, actual: '', expected }),
    });
    assert.equal(result.status, status);
  }
  assert.equal((await fetch(`${baseUrl}/browser-replay/session?sessionId=missing`)).status, 404);
});

test('API bằng chứng chỉ đọc tệp thật trong thư mục log và không thực thi HTML', async () => {
  await mkdir(interactionHtmlDirectory, { recursive: true });
  const inside = join(interactionHtmlDirectory, 'evidence.html');
  const outside = join(directory, 'private.txt');
  const linked = join(interactionHtmlDirectory, 'linked.html');
  await writeFile(inside, '<script>window.injected=true</script>');
  await writeFile(outside, 'private');
  await symlink(outside, linked);
  for (const [filename, status] of [[inside, 200], [outside, 404], [linked, 404]]) {
    legacySession.logs[0].htmlPath = filename;
    const response = await fetch(`${baseUrl}/browser-replay/artifact?sessionId=replay-fixture&eventId=legacy-0&kind=html`);
    assert.equal(response.status, status);
    if (status === 200) {
      assert.ok(response.headers.get('content-type').startsWith('text/plain'));
      assert.ok(response.headers.get('content-security-policy').includes('sandbox'));
    }
  }
  legacySession.logs[0].htmlPath = inside;
  await rm(linked);
});

test('lưu log đồng thời luôn tạo JSON hoàn chỉnh và giữ lần cập nhật mới nhất', async () => {
  const pending = [];
  for (let index = 0; index < 8; index++) { legacySession.revision = index; pending.push(savePersistedBrowserLogs()); }
  assert.ok((await Promise.all(pending)).every(Boolean));
  const saved = JSON.parse(await readFile(join(directory, 'logs/browser-logs.json'), 'utf8'));
  assert.equal(saved.find(session => session.id === legacySession.id).revision, 7);
});

test('lỗi screenshot vẫn giữ HTML và trạng thái form, không làm mất sự kiện', async () => {
  const snapshot = await captureBrowserSnapshot({
    isClosed: () => false, url: () => `${baseUrl}/offer`, content: async () => '<form hidden></form>',
    screenshot: async () => { throw new Error('Screenshot timeout'); }, title: async () => 'Hidden form', frames: () => [],
  }, { offerNumber: 1 }, 'submit_clicked');
  assert.ok(snapshot.htmlPath);
  assert.equal(snapshot.screenshotPath, null);
  assert.match(snapshot.snapshotError, /Screenshot timeout/);
});

test('bằng chứng giống nhau dùng lại file; file bị xóa được tạo lại thay vì giữ tham chiếu hỏng', async () => {
  const page = {
    isClosed: () => false, url: () => `${baseUrl}/stable`, content: async () => '<form></form>',
    screenshot: async () => Buffer.from('same-image'), title: async () => 'Stable', frames: () => [],
  };
  const first = await captureBrowserSnapshot(page, { offerNumber: 1 }, 'submit_clicked');
  const reused = await captureBrowserSnapshot(page, { offerNumber: 1 }, 'page_error', first);
  assert.equal(reused.snapshotReused, true);
  assert.equal(reused.screenshotPath, first.screenshotPath);
  assert.equal(reused.htmlPath, first.htmlPath);
  await rm(first.screenshotPath);
  const repaired = await captureBrowserSnapshot(page, { offerNumber: 1 }, 'page_error', first);
  assert.notEqual(repaired.screenshotPath, first.screenshotPath);
  assert.equal(existsSync(repaired.screenshotPath), true);
});

test('request chưa trả về giữ trạng thái pending, response và lỗi gắn cùng requestId', () => {
  const page = new EventEmitter();
  const events = [];
  const failures = [];
  attachNetworkDiagnostics(page, entry => { events.push(entry); return entry; }, entry => failures.push(entry));
  const request = { resourceType: () => 'fetch', url: () => 'https://local.invalid/api', method: () => 'POST', failure: () => ({ errorText: 'net::ERR_TIMED_OUT' }) };
  page.emit('request', request);
  assert.equal(events[0].outcome, 'pending');
  page.emit('response', { request: () => request, status: () => 504, statusText: () => 'Gateway Timeout', url: request.url });
  page.emit('requestfailed', request);
  assert.equal(events[0].outcome, 'failed');
  assert.equal(events[0].status, 504);
  assert.ok(events[0].durationMs >= 0);
  assert.ok(failures.every(event => event.requestId === events[0].requestId));
});

test('Chromium ghi đủ hành động/iframe/chuyển trang, lỗi mạng và xem lại bằng giao diện thật', {
  skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium cho Playwright',
}, async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/offer`);
  const session = { tileIndex: 0, exitIp: '198.51.100.20', currentScreen: 2, recorderDebugUntil: Date.now() + 300_000 };
  attachBrowserLogger(context, session);
  const recorder = startManualOpsRecorder(context, session, directory, { onLog: (entry, source) => session.addBrowserLog(entry, source) });
  await recorder.ready;
  await page.frameLocator('iframe').locator('#child-button').click();
  await waitForRecording(() => session.logs.some(entry => entry.el?.id === 'child-button'));
  await page.locator('#password').fill('do-not-record-password');
  await page.locator('#email').fill('local@example.invalid');
  await page.locator('#submit').click();
  await waitForRecording(() => session.logs.some(entry => entry.kind === 'submit' && (entry.screenshotPath || session.logs.find(event => event.id === entry.snapshotEventId)?.screenshotPath)));
  const submitted = session.logs.find(entry => entry.kind === 'submit');
  assert.ok(session.logs.some(entry => entry.kind === 'form_state' && entry.visible === false));
  const submitEvidence = submitted.snapshotEventId ? session.logs.find(event => event.id === submitted.snapshotEventId) : submitted;
  assert.ok(submitEvidence.formState.some(frame => frame.forms?.some(form => form.id === 'registration' && form.controls.every(control => !control.visible))));
  assert.equal(JSON.stringify(session.logs).includes('do-not-record-password'), false);
  await page.evaluate(() => { document.querySelector('form').hidden = false; });
  await waitForRecording(() => session.logs.some(entry => entry.kind === 'form_state' && entry.visible && !entry.created));
  await page.evaluate(async () => {
    console.error('diagnostic-console'); console.error('diagnostic-console');
    await (await fetch('/failure')).text();
    setTimeout(() => { throw new Error('diagnostic-page-error'); }, 0);
  });
  await page.route('**/aborted', route => route.abort('failed'));
  await page.evaluate(() => fetch('/aborted').catch(() => {}));
  await waitForRecording(() => ['page_error', 'http_error', 'request_failed'].every(type => session.logs.some(entry => entry.type === type)));
  await waitForRecording(() => session.logs.some(entry => entry.type === 'network_request' && entry.status === 503 && entry.durationMs >= 0));
  assert.ok(session.logs.some(entry => entry.type === 'network_request' && entry.status === 503 && entry.durationMs >= 0));
  assert.equal(session.logs.find(entry => entry.detail === 'diagnostic-console').repeatCount, 2);
  await page.locator('#next').click();
  await waitForRecording(() => session.logs.some(entry => entry.kind === 'click' && entry.el?.id === 'next'));
  assert.ok(session.logs.some(entry => entry.type === 'navigate' && entry.mainFrame));
  await recorder.flush();
  const jsonl = await readFile(recorder.filePath, 'utf8');
  assert.ok(jsonl.includes('child-button'));
  assert.equal(jsonl.includes('do-not-record-password'), false);
  await context.close();
  assert.equal(browserSessionLogs.has(session), false);
  assert.ok(session.logs.some(entry => entry.type === 'session_closed'));
  const viewer = await browser.newPage();
  const errors = [];
  viewer.on('pageerror', error => errors.push(error.message));
  await viewer.goto(`${baseUrl}/browser-replay?sessionId=${legacySession.id}`);
  await viewer.locator('#feedback-list li').waitFor();
  assert.ok((await viewer.locator('#feedback-list').innerText()).includes('<script>'));
  assert.equal(await viewer.evaluate(() => window.injected), undefined);
  await viewer.goto(`${baseUrl}/browser-replay?sessionId=${session.recordingId}`);
  await viewer.locator('#events option').first().waitFor();
  await viewer.waitForFunction(() => document.querySelector('#screenshot').naturalWidth > 0);
  await viewer.locator('#errors-only').check();
  assert.ok(await viewer.locator('#events option').count() >= 3);
  await viewer.locator('#actual').fill('Lỗi form hiện lại');
  await viewer.locator('#expected').fill('Giữ trạng thái đã submit');
  await viewer.locator('#save-feedback').click();
  await viewer.locator('#feedback-list li').waitFor();
  assert.match(await viewer.locator('#feedback-list').innerText(), /Giữ trạng thái đã submit/);
  assert.deepEqual(errors, []);
});

test('ZIP xuất chứa JSON sự kiện/ghi chú, JSONL hành động và bằng chứng HTML', async () => {
  await writeFile(join(directory, 'logs/manual-ops-fixture.jsonl'), JSON.stringify({ kind: 'click', el: { id: 'submit' } }) + '\n');
  const archive = await createBrowserLogsArchive();
  const archivePath = join(directory, 'export.zip');
  await writeFile(archivePath, archive);
  const files = execFileSync('unzip', ['-Z1', archivePath], { encoding: 'utf8' });
  assert.ok(files.includes('browser-logs.json'));
  assert.ok(files.includes('manual-ops-fixture.jsonl'));
  assert.ok(files.includes('html/evidence.html'));
  const data = JSON.parse(execFileSync('unzip', ['-p', archivePath, 'browser-logs.json'], { encoding: 'utf8' }));
  assert.equal(data.find(session => session.id === legacySession.id).feedback[0].eventId, 'legacy-0');
});

test('normal: 1.000 request thành công hoặc bị Data Saver chặn chỉ tạo thống kê mạng', () => {
  for (const blocked of [false, true]) {
    const page = new EventEmitter();
    page.url = () => 'https://local.invalid/form';
    const events = [];
    const failures = [];
    attachNetworkDiagnostics(page, entry => { events.push(entry); return entry; }, entry => failures.push(entry));
    for (let index = 0; index < 1000; index++) {
      const request = { resourceType: () => 'fetch', url: () => `https://local.invalid/poll?t=${index}`, method: () => 'GET', failure: () => ({ errorText: 'net::ERR_BLOCKED_BY_CLIENT' }) };
      page.emit('request', request);
      if (blocked) page.emit('requestfailed', request);
      else {
        page.emit('response', { request: () => request, status: () => 200 });
        page.emit('requestfinished', request);
      }
    }
    page.emit('close');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'network_summary');
    assert.equal(events[0].started, 1000);
    assert.equal(events[0].blockedByPolicy, blocked ? 1000 : 0);
    assert.equal(events[0].finished, blocked ? 0 : 1000);
    assert.deepEqual(failures, []);
  }
});

test('normal: 1.000 lỗi HTTP cùng API chỉ giữ nhóm request, lỗi và một thống kê', () => {
  const page = new EventEmitter();
  page.url = () => 'https://local.invalid/form';
  const events = [];
  const coalesce = createLogCoalescer();
  const add = entry => coalesce(entry, page, () => { events.push(entry); return entry; }).entry;
  attachNetworkDiagnostics(page, add, add);
  for (let index = 0; index < 1000; index++) {
    const request = { resourceType: () => 'fetch', url: () => `https://local.invalid/form-api?t=${index}`, method: () => 'GET' };
    page.emit('request', request);
    page.emit('response', { request: () => request, status: () => 503, statusText: () => 'Unavailable' });
    page.emit('requestfinished', request);
  }
  page.emit('close');
  assert.equal(events.length, 3);
  assert.equal(events.find(entry => entry.type === 'http_error').repeatCount, 1000);
  assert.equal(events.find(entry => entry.type === 'network_request').repeatCount, 1000);
  assert.equal(events.find(entry => entry.type === 'network_summary').httpErrors, 1000);
});

test('normal Chromium: input vào bộ đệm, lỗi có ngữ cảnh; UI bật/tắt debug đúng phiên', {
  skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium',
}, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/offer`);
  const session = { slot: 2, tileIndex: 1 };
  attachBrowserLogger(context, session);
  const recorder = startManualOpsRecorder(context, session, directory, { onLog: (entry, source) => session.addBrowserLog(entry, source) });
  await recorder.ready;
  await waitForRecording(() => session.logs.some(entry => entry.screenshotPath));
  const countBefore = session.logs.length;
  await page.evaluate(async () => {
    await Promise.all(Array.from({ length: 1000 }, (_, index) => window.__autoleadBrowserEvent({ kind: 'input', el: { tag: 'input', id: `field-${index}`, filled: true, value: 'must-not-record' } })));
  });
  await recorder.flush();
  assert.equal(session.logs.length, countBefore);
  assert.equal(existsSync(recorder.filePath), false);
  await page.evaluate(() => { console.error('normal-mode-diagnostic'); });
  await waitForRecording(() => session.logs.some(entry => entry.type === 'console_error' && entry.screenshotPath));
  const error = session.logs.find(entry => entry.type === 'console_error');
  assert.equal(error.recentActions.length, 100);
  assert.equal(error.recentActions.at(-1).el.id, 'field-999');
  assert.equal(JSON.stringify(session.logs).includes('must-not-record'), false);
  const viewer = await browser.newPage();
  await viewer.goto(`${baseUrl}/browser-replay?sessionId=${session.recordingId}`);
  await viewer.locator('#debug-start:enabled').waitFor();
  await viewer.locator('#debug-start').click();
  await waitForRecording(() => session.recorderDebugUntil > Date.now());
  await page.evaluate(() => window.__autoleadBrowserEvent({ kind: 'input', el: { tag: 'input', id: 'debug-probe', value: 'must-not-record' } }));
  await recorder.flush();
  assert.match(await readFile(recorder.filePath, 'utf8'), /debug-probe/);
  assert.equal((await readFile(recorder.filePath, 'utf8')).includes('must-not-record'), false);
  await viewer.locator('#debug-stop:enabled').click();
  await waitForRecording(() => session.recorderDebugUntil === 0);
  await page.evaluate(() => window.__autoleadBrowserEvent({ kind: 'input', el: { tag: 'input', id: 'after-debug-stop' } }));
  await recorder.flush();
  assert.equal((await readFile(recorder.filePath, 'utf8')).includes('after-debug-stop'), false);
  for (const payload of [{ sessionId: session.recordingId, enabled: true, durationSeconds: 601 }, { sessionId: 'missing', enabled: true }]) {
    const response = await fetch(`${baseUrl}/browser-replay/recording-debug`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal(response.status, payload.sessionId === 'missing' ? 404 : 400);
  }
  await context.close();
  await recorder.stop();
});
