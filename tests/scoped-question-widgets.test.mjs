import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';
import { processScopedWidgets } from '../src/autofill/form-scope/process-scoped-widgets.mjs';
import { inspectAiStateGate, blockAiForState } from '../src/ai-assist/retry/ai-state-gate.mjs';

test('khảo sát Alpha/MUI chờ animation thật và chỉ chọn đáp án trong scope', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  for (const type of ['alpha', 'mui']) await t.test(type, async () => {
    const attributes = type === 'alpha' ? 'class="question-answer-button"' : 'data-tf-element-role="submit" name="answer"';
    const { context, page } = await createFormScopeFixture(browser, `<aside><button ${attributes}>Outside</button></aside><div id="active" style="opacity:0"><h3 id="questionText">Select an option</h3><button ${attributes} onclick="this.dataset.hit=1;this.setAttribute('aria-pressed','true')">One</button><button ${attributes} onclick="this.dataset.hit=1;this.setAttribute('aria-pressed','true')">Two</button></div>`);
    try {
      const frame = page.mainFrame();
      frame._activeAutofillFormScope = { active: true, memberSelector: ':is(#active, #active *)', rootSelector: '#active' };
      const args = { frame, page, record: {}, options: {} };
      assert.equal(await processScopedWidgets(args), 0);
      assert.equal(await page.locator('#active').evaluate(element => getComputedStyle(element).opacity), '0');
      assert.equal(await page.locator('[data-hit]').count(), 0);
      await page.locator('#active').evaluate(element => { element.style.opacity = '1'; });
      frame._uxQHandledAt = frame._uxMuiQHandledAt = frame._uxTwyHandledAt = 0;
      assert.equal(await processScopedWidgets(args), 1);
      assert.equal(await page.locator('#active button').first().getAttribute('data-hit'), '1');
      assert.equal(await page.locator('aside button').getAttribute('data-hit'), null);
      frame._uxQHandledAt = frame._uxMuiQHandledAt = frame._uxTwyHandledAt = 0;
      assert.equal(await processScopedWidgets(args), 0);
      assert.equal(await page.locator('#active button').nth(1).getAttribute('data-hit'), null);
    } finally { await context.close(); }
  });
});

test('lỗi đọc DOM tạm thời không xóa khóa retry của trạng thái đã thất bại', () => {
  const page = {}, state = { available: true, hasWork: true, signature: 'unchanged' };
  blockAiForState(page, state.signature);
  assert.equal(inspectAiStateGate(page, { available: false, signature: 'unknown' }).allowed, false);
  assert.equal(inspectAiStateGate(page, state).reason, 'unchanged_after_failure');
  assert.equal(inspectAiStateGate(page, { ...state, signature: 'new-step' }).allowed, true);
});
