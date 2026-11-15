import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { chromium } from 'playwright';

const directory = mkdtempSync(join(homedir(), 'Library/Application Support/AutoLeadPC-tests-input-html-'));
process.env.AUTOLEADPC_DATA_DIR = basename(directory);
process.env.AUTOLEADPC_LOG_MODE = 'access';
const { attachBrowserLogger } = await import('../src/browser/actions/attach-browser-logger.mjs');
const { tryFastTextInput } = await import('../src/autofill/interaction/try-fast-text-input.mjs');
const { humanType } = await import('../src/autofill/human-type.mjs');
const { fillSelectOrTextField } = await import('../src/autofill/fill-select-or-text-field.mjs');
const { recordInputFillHtml } = await import('../src/logging/record-input-fill-html.mjs');
const { persistedBrowserLogs, savePersistedBrowserLogs, interactionLogFilePath } = await import('../src/logging/browser-logs.mjs');
const { moduleState } = await import('../src/logging/browser-logs/state/module-state.mjs');
test.after(async () => { clearTimeout(moduleState.saveBrowserLogsTimer); await savePersistedBrowserLogs(); rmSync(directory, { recursive: true, force: true }); });

test('mỗi lượt nhập nhanh/chậm/date giữ một HTML ô nhập, xem và lưu được trong chế độ access', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<form><input id="name" name="firstname" type="text" aria-label="First Name" value="private-old-value" data-token="secret-token" oninput="void 0"><input id="dob" type="date"><textarea id="notes">private-notes</textarea></form>' }));
  await page.goto('https://input-html.test/form?token=secret-query');
  const session = { slot: 2, exitIp: '192.0.2.10', enableLeadCheck: false };
  page._autofillSession = session;
  page._autofillMouseSlot = 2;
  attachBrowserLogger(context, session);
  const entries = () => persistedBrowserLogs.find(item => item.id === session.recordingId).logs.filter(entry => entry.type === 'input_fill_html');
  assert.equal(await tryFastTextInput(page.locator('#name'), 'Ada', page), true);
  assert.equal(entries().length, 1);
  assert.match(entries()[0].html, /<input/);
  assert.match(entries()[0].html, /aria-label="First Name"/);
  assert.doesNotMatch(entries()[0].html, /value=|private-old-value|secret-token|oninput|<form|<html/);
  assert.equal(entries()[0].pageUrl, 'https://input-html.test/form');
  assert.equal(entries()[0].ip, session.exitIp);
  await humanType(page.locator('#name'), 'Grace', page, { simulateTypo: false });
  assert.equal(entries().length, 2, 'humanType dùng fast không tạo hai dòng cho cùng lần nhập');
  page._autofillMouseSlot = 1;
  await humanType(page.locator('#name'), 'Ada', page, { simulateTypo: false });
  assert.equal(entries().length, 3, 'gõ từng ký tự chỉ tạo một dòng');
  await fillSelectOrTextField({ metadata: { kind: 'input', type: 'date', id: 'dob', names: ['dob'] }, field: page.locator('#dob'), page, valueToFill: '1990-01-02', options: {}, session, frameProgress: { filledInThisPass: 0 }, unmatchedFieldNames: new Set(), frame: page.mainFrame(), record: {} });
  assert.equal(entries().length, 4);
  assert.equal(await page.locator('#dob').inputValue(), '1990-01-02');
  await recordInputFillHtml(page.locator('#notes'), page);
  assert.doesNotMatch(entries().at(-1).html, /private-notes/);
  await page.locator('#name').evaluate(element => element.className = 'x'.repeat(12000));
  await recordInputFillHtml(page.locator('#name'), page);
  assert.ok(entries().at(-1).html.length <= 8192);
  await page.evaluate(() => { const iframe = document.createElement('iframe'); iframe.id = 'child'; iframe.src = '/frame?token=secret-frame'; document.body.appendChild(iframe); });
  await page.frameLocator('#child').locator('#name').waitFor();
  await recordInputFillHtml(page.frameLocator('#child').locator('#name'), page);
  assert.equal(entries().at(-1).frameUrl, 'https://input-html.test/frame');
  assert.equal(entries().at(-1).pageUrl, 'https://input-html.test/form');
  await savePersistedBrowserLogs();
  const stored = JSON.parse(readFileSync(interactionLogFilePath, 'utf8')).find(item => item.id === session.recordingId);
  assert.equal(stored.logs.filter(entry => entry.type === 'input_fill_html').length, entries().length);
  assert.ok(readdirSync(join(directory, 'logs')).every(name => !/\.(html|png|jsonl)$/.test(name)));
  await context.close();
});

test('lỗi đọc HTML không cản trở fill; không có session thì không đọc DOM thêm', async () => {
  let current = '';
  let reads = 0;
  const field = { fill: async value => { current = value; }, inputValue: async () => current, evaluate: async () => { reads++; throw new Error('detached'); } };
  const page = { url: () => 'https://input-html.test/form', _autofillSession: { addBrowserLog() {} } };
  assert.equal(await tryFastTextInput(field, 'Ada', page), true);
  assert.equal(reads, 1);
  await recordInputFillHtml(field, {});
  assert.equal(reads, 1);
});

test('logger full giữ HTML và URL đã bỏ query, không yêu cầu snapshot cho input', () => {
  process.env.AUTOLEADPC_LOG_MODE = 'full';
  const context = new EventEmitter();
  context.pages = () => [];
  const session = { slot: 3 };
  attachBrowserLogger(context, session);
  const page = { url: () => 'https://input-html.test/form?secret=query', isClosed: () => false };
  const event = session.addBrowserLog({ type: 'input_fill_html', html: '<input id="test">', pageUrl: 'https://input-html.test/form' }, page);
  assert.equal(event.html, '<input id="test">');
  assert.equal(event.pageUrl, 'https://input-html.test/form');
  assert.equal(event.screenshotPath, undefined);
  context.emit('close');
  process.env.AUTOLEADPC_LOG_MODE = 'access';
});

test('URL data không làm lộ toàn bộ trang hoặc giá trị input trong log', async () => {
  const logs = [];
  const page = { url: () => 'data:text/html,<input value="private-data">', _autofillSession: { addBrowserLog: entry => logs.push(entry) } };
  await recordInputFillHtml({ evaluate: async () => ({ html: '<input>', fieldId: 'test', frameUrl: 'data:text/html,<input value="private-frame">' }) }, page);
  assert.equal(logs[0].pageUrl, 'data:');
  assert.equal(logs[0].frameUrl, 'data:');
  assert.doesNotMatch(JSON.stringify(logs), /private-data|private-frame/);
});
