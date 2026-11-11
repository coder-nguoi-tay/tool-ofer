import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';
import { readVisiblePageState } from '../src/ai-assist/visible-state/read-visible-page-state.mjs';
import { pageHasWork } from '../src/ai-assist/page-has-work.mjs';
import { runAiAssist } from '../src/ai-assist/run-ai-assist.mjs';
import { blockAiForState, inspectAiStateGate } from '../src/ai-assist/retry/ai-state-gate.mjs';
import { attachAutofillPageWatcher } from '../src/autofill/attach-autofill-page-watcher.mjs';

const widget = `<style>.twy-hide{display:none}.old-step{opacity:0}label{display:block}</style>
<div id="survey"><div class="old-step"><input id="3949" required><button>Old Continue</button></div>
<div class="twy-campaign-container-regular"><div id="regular" hidden><input id="twyinputyes-1680" type="radio" name="campaign"><input id="twyinputno-1680" type="radio" name="campaign"></div>
<div class="twy-customquestion" id="question"><h3 class="twy-cqlabel">Which descriptors apply to your household?</h3>
${Array.from({ length: 11 }, (_, index) => `<label><input type="checkbox" id="5420" name="cq1" value="${index}" checked>Choice ${index}</label>`).join('')}</div></div>
<div id="next" class="twy-hide"><button id="twy-buttonnext-12">Continue</button></div></div>
<aside><button>Unrelated Continue</button><input name="email"></aside>`;

test('AI chỉ đọc control đang hiển thị và chờ khi widget chưa có bước tiếp', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, widget);
  t.after(() => context.close());
  const frame = page.mainFrame();
  frame._activeAutofillFormScope = { active: true, rootSelector: '#survey', memberSelector: ':is(#survey, #survey *)', nativeForm: false };
  page._activeAutofillFrame = frame;

  await t.test('bỏ bước opacity=0, radio và Continue ẩn bởi cha; giữ selector riêng dù id trùng', async () => {
    const state = await readVisiblePageState(page);
    assert.equal(state.available, true);
    assert.equal(state.hasWork, false);
    assert.equal(state.frames[0].controls.length, 11);
    assert.equal(new Set(state.frames[0].controls.map(control => control.selector)).size, 11);
    assert.ok(!state.html.includes('3949'));
    assert.ok(!state.html.includes('Old Continue'));
    assert.ok(!state.html.includes('twy-buttonnext-12'));
    assert.ok(!state.html.includes('Unrelated Continue'));
    assert.equal(await pageHasWork(page), false);
    const repeated = await readVisiblePageState(page);
    assert.equal(repeated.signature, state.signature);
  });

  await t.test('không gọi CLI và không ghi lại cùng cảnh báo trong nhiều lượt AI', async () => {
    const logs = [], session = {};
    for (let round = 0; round < 3; round++) await runAiAssist(page, {}, session, {
      aiConfig: { enabled: true, mode: 'codex', cliBinary: '/nonexistent-cli' }, onLog: entry => logs.push(entry),
    });
    assert.equal(logs.filter(log => log.type === 'ai_started').length, 0);
    assert.equal(logs.filter(log => log.type === 'ai_waiting_state').length, 1);
    assert.equal(session.aiAssistRunning, false);
  });

  await t.test('watchdog không khởi động lại AI khi chỉ còn lựa chọn đã hoàn tất', async () => {
    let callbacks = 0;
    const session = {};
    attachAutofillPageWatcher(page, { trackedPages: new WeakSet(), options: { libraryFirstPassDelayMs: 0, onStuck: () => callbacks++ }, session,
      fillVisibleForms: async () => {}, record: {}, checkLeadAfterEmailOnPage() {}, isSpamAdUrl: () => false, watchPage() {} });
    for (let index = 0; index < 8; index++) { session.triggerAutofillScan?.(); await page.waitForTimeout(35); }
    assert.equal(callbacks, 0);
  });

  await t.test('Continue xuất hiện hoặc đáp án đổi sẽ tạo trạng thái mới và mở lại AI', async () => {
    const oldState = await readVisiblePageState(page);
    await page.locator('#next').evaluate(element => element.classList.remove('twy-hide'));
    const state = await readVisiblePageState(page);
    assert.notEqual(state.signature, oldState.signature);
    assert.equal(state.hasWork, true);
    blockAiForState(page, state.signature);
    assert.equal(inspectAiStateGate(page, state).reason, 'unchanged_after_failure');
    const logs = [];
    await runAiAssist(page, {}, {}, { aiConfig: { enabled: true, mode: 'codex', cliBinary: '/nonexistent-cli' }, onLog: entry => logs.push(entry) });
    assert.equal(logs.filter(log => log.type === 'ai_started').length, 0);
    await page.locator('input[type=checkbox]').first().uncheck();
    assert.equal(inspectAiStateGate(page, await readVisiblePageState(page)).allowed, true);
    blockAiForState(page, state.signature);
    assert.equal(inspectAiStateGate(page, state, true).allowed, true);
    const otherPage = {};
    assert.equal(inspectAiStateGate(otherPage, state).allowed, true);
  });
});

test('không xem lỗi đọc DOM là form trống hoặc cho phép AI đoán control ẩn', async () => {
  const page = { evaluate: async () => { throw new Error('frame detached'); } };
  const state = await readVisiblePageState(page);
  assert.equal(state.available, false);
  assert.equal(state.hasWork, false);
  assert.equal(inspectAiStateGate(page, state).reason, 'inspection_unavailable');
});

test('không cho phép AI từ kết quả boolean thiếu bằng chứng DOM', async () => {
  const state = await readVisiblePageState({ evaluate: async () => true });
  assert.equal(state.available, false);
  assert.equal(state.hasWork, false);
});
