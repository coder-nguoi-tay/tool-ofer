import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { attachAutofill } from '../src/autofill/attach-autofill.mjs';
import { runModeState, applyRunMode } from '../src/runtime/constants/run-mode-state.mjs';

/**
 * Context giả đếm số lần đăng ký sự kiện 'page'.
 * @return {{on:Function,pages:Function,registered:string[]}} Context giả.
 */
const fakeContext = () => { const registered = []; return { registered, pages: () => [], on: event => { registered.push(event); } }; };

test.afterEach(() => { runModeState.manual = false; });

test('Chế độ chạy "Làm thủ công": autofill/AI không được gắn vào bất kỳ tab nào, session đánh dấu manual', () => {
  applyRunMode('manual');
  const context = fakeContext(), session = {}, logs = [];
  attachAutofill(context, [{ email: 'a@b.test' }], 'https://offer.test', session, { onLog: entry => logs.push(entry) });
  assert.equal(session.offerMode, 'manual');
  assert.equal(session.runMode, 'manual');
  assert.equal(context.registered.length, 1, 'chỉ chính sách chuột; không đăng ký watcher autofill cho tab mới');
  assert.ok(logs.some(entry => entry.type === 'offer_manual'));
});

test('Chế độ auto vẫn gắn autofill như cũ (đối chứng: test phát hiện được sự khác biệt)', () => {
  applyRunMode('auto');
  const context = fakeContext(), session = {};
  attachAutofill(context, [{ email: 'a@b.test' }], 'https://offer.test', session, {});
  assert.equal(context.registered.length, 2, 'chính sách chuột + watcher autofill');
  assert.notEqual(session.offerMode, 'manual');
});

test('applyRunMode: chỉ đúng chuỗi "manual" mới bật; giá trị lạ/thiếu về auto (mặc định an toàn cho luồng cũ)', () => {
  assert.equal(applyRunMode('manual'), true);
  assert.equal(runModeState.manual, true);
  for (const value of ['auto', 'sequential', undefined, '', 'MANUAL ', null]) {
    assert.equal(applyRunMode(value), false, String(value));
    assert.equal(runModeState.manual, false);
  }
});

test('UI gửi runMode cho server; chế độ thủ công vẫn giữ tự bù slot', async () => {
  const ui = await readFile(new URL('../ui/desktop/functions/handle-start.js', import.meta.url), 'utf8');
  assert.match(ui, /runMode:\s*mode/, 'handleStart phải gửi runMode');
  const launch = await readFile(new URL('../src/browser/actions/launch-user-requested-browsers.mjs', import.meta.url), 'utf8');
  assert.match(launch, /applyRunMode\(body\.runMode\)/);
  // Thủ công chỉ tắt autofill/AI. Slot chết (lỗi mạng, hết giờ...) vẫn phải được bù: bộ canh trang đóng trình duyệt
  // rồi bỏ qua bù nếu autoRefill.enabled tắt hoặc thiếu settings → app "đứng yên" (lỗi 2026-11-15).
  assert.ok(!/if \(manual\)/.test(launch), 'không còn nhánh thủ công tắt tự bù');
  assert.ok(!/autoRefill\.enabled = false/.test(launch), 'Start không bao giờ tắt tự bù');
  assert.match(launch, /autoRefill\.enabled = true/);
  assert.match(launch, /queueAutomaticRefill\(/);
  const sequential = await readFile(new URL('../src/http/routes/auto/post-refill-sequential.mjs', import.meta.url), 'utf8');
  assert.match(sequential, /applyRunMode\('auto'\)/, 'chuyển sang tuần tự phải tắt cờ thủ công');
});

test('phiên bù slot mở sau đó vẫn là thủ công: cờ giữ nguyên tới lần Start/Tuần tự kế tiếp', () => {
  applyRunMode('manual');
  for (let refill = 0; refill < 3; refill++) {
    const context = fakeContext(), session = {};
    attachAutofill(context, [{ email: 'a@b.test' }], 'https://offer.test', session, {});
    assert.equal(session.offerMode, 'manual', `phiên bù ${refill + 1}`);
    assert.equal(context.registered.length, 1);
  }
});
