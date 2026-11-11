import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRecentActionBuffer } from '../src/logging/recorder/create-recent-action-buffer.mjs';
import { createLogCoalescer } from '../src/logging/recorder/create-log-coalescer.mjs';
import { isDetailedRecording, shouldCaptureEvent } from '../src/logging/recorder/recording-policy.mjs';
import { limitSessionEvents } from '../src/logging/recorder/limit-session-events.mjs';
import { reserveEvidenceCapture } from '../src/logging/recorder/reserve-evidence-capture.mjs';
import { readEvidenceWithTimeout } from '../src/logging/recorder/read-evidence-with-timeout.mjs';
import { createBatchedActionWriter } from '../src/observer/create-batched-action-writer.mjs';

test('normal: không chụp từng field/input/click; giữ submit, đổi màn và lỗi mới', () => {
  for (const type of ['field_filled', 'checkbox_checked', 'ai_action', 'network_summary']) assert.equal(shouldCaptureEvent({ type }), false);
  for (const kind of ['input', 'scroll', 'click', 'change']) assert.equal(shouldCaptureEvent({ type: 'browser_action', kind }), false);
  for (const kind of ['submit', 'form_state']) assert.equal(shouldCaptureEvent({ type: 'browser_action', kind }), true);
  assert.equal(shouldCaptureEvent({ type: 'navigate', mainFrame: false }), false);
  assert.equal(shouldCaptureEvent({ type: 'page_error' }), true);
  assert.equal(shouldCaptureEvent({ type: 'request_failed', blockedAtClient: true }), false);
  assert.equal(isDetailedRecording({ recorderDebugUntil: Date.now() - 1 }), false);
});

test('bộ đệm: 1.000 thao tác chỉ giữ 100 mỗi tab và tự hết hạn sau 60 giây', t => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const buffer = createRecentActionBuffer();
  const first = {};
  const second = {};
  for (let i = 0; i < 1000; i++) buffer.push(first, { kind: 'input', order: i });
  buffer.push(second, { kind: 'click' });
  assert.equal(buffer.read(first).length, 100);
  assert.equal(buffer.read(first)[0].order, 900);
  assert.equal(buffer.read(second).length, 1);
  now += 60_001;
  assert.equal(buffer.read(first).length, 0);
});

test('gộp lỗi: query tracking đổi không tạo lỗi mới; tab/status khác giữ tách biệt', t => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const coalesce = createLogCoalescer();
  const page = {};
  let created = 0;
  const add = (entry, target = page) => coalesce(entry, target, () => ({ ...entry, id: ++created }));
  const error = { type: 'http_error', url: 'https://api.test/form?a=1', detail: 'HTTP 503', status: 503 };
  const initial = add(error);
  for (let i = 0; i < 1000; i++) assert.equal(add({ ...error, url: `https://api.test/form?a=${i}` }).isNew, false);
  assert.equal(initial.entry.repeatCount, 1001);
  assert.equal(add(error, {}).isNew, true);
  assert.equal(add({ ...error, status: 504 }).isNew, true);
  now += 60_000;
  assert.equal(add(error).isNew, true);
});

test('giới hạn timeline giữ sequence, ghi chú và bằng chứng được tham chiếu', () => {
  const session = { logs: Array.from({ length: 5000 }, (_, index) => ({ id: `event-${index}`, sequence: index + 1 })), feedback: [{ eventId: 'event-3' }] };
  session.logs[4999].snapshotEventId = 'event-5';
  limitSessionEvents(session);
  assert.equal(session.logs.length, 2002);
  assert.equal(session.omittedEventCount, 2998);
  assert.ok(session.logs.some(entry => entry.id === 'event-3'));
  assert.ok(session.logs.some(entry => entry.id === 'event-5'));
  assert.equal(session.logs.at(-1).sequence, 5000);
});

test('bằng chứng chỉ có hai lượt chụp toàn app và trả chỗ idempotent', () => {
  const first = reserveEvidenceCapture();
  const second = reserveEvidenceCapture();
  assert.equal(reserveEvidenceCapture(), null);
  first(); first();
  const third = reserveEvidenceCapture();
  assert.equal(typeof third, 'function');
  second(); third();
});

test('renderer đọc bằng chứng treo: hết hạn nhưng không phát lặp lệnh cũ', async t => {
  const timers = [];
  t.mock.method(globalThis, 'setTimeout', callback => { timers.push(callback); return { unref() {} }; });
  t.mock.method(globalThis, 'clearTimeout', () => {});
  const page = {};
  let finish;
  let calls = 0;
  const read = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const pending = readEvidenceWithTimeout(page, 'html', read);
  const rejected = assert.rejects(pending, /Quá 3 giây/);
  await Promise.resolve();
  timers.shift()();
  await rejected;
  await assert.rejects(readEvidenceWithTimeout(page, 'html', read), /lượt chụp trước/);
  assert.equal(calls, 1);
  finish('late');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await readEvidenceWithTimeout(page, 'html', async () => 'ready'), 'ready');
});

test('JSONL debug: ghi lô, xoay 5 MB và stop chờ lô cuối, không ghi sau stop', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'autolead-writer-'));
  try {
    const path = join(directory, 'manual-ops-test.jsonl');
    await writeFile(path, 'x'.repeat(5 * 1024 * 1024));
    const errors = [];
    const writer = createBatchedActionWriter(path, error => errors.push(error));
    for (let index = 0; index < 100; index++) writer.append({ kind: 'click', index });
    await writer.stop();
    writer.append({ index: 100 });
    assert.equal((await readdir(directory)).length, 2);
    const lines = (await readFile(path, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(lines.length, 100);
    assert.equal(lines.at(-1).index, 99);
    assert.deepEqual(errors, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('JSONL debug có trần bộ đệm và báo số sự kiện bị lược khi quá tải', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'autolead-writer-'));
  try {
    const path = join(directory, 'manual-ops-overflow.jsonl');
    const errors = [];
    const writer = createBatchedActionWriter(path, error => errors.push(error));
    for (let index = 0; index < 2000; index++) writer.append({ kind: 'click', index, text: 'x'.repeat(1000) });
    await writer.stop();
    const content = await readFile(path, 'utf8');
    assert.ok(Buffer.byteLength(content) <= 256 * 1024);
    assert.equal(JSON.parse(content.trim().split('\n').at(-1)).index, 1999);
    assert.match(errors[0], /đã bỏ/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
