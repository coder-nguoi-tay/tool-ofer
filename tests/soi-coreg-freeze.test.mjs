import { chromium } from 'playwright';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { handleAlphaIntentSoiCards, findSubmitButton } from "../autofill.mjs";
import { pageHasWork, detectSmartFallbackAction } from "../ai-assist.mjs";

test('SOI xác minh Yes/No và consent, không khóa thẻ khi website chưa nhận lựa chọn', async t => {
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  for (const verified of [false,true]) {
    const {context,page}=await createFormScopeFixture(browser,`<div class="soi-card"><h3>Choose your offer</h3><label><input type="checkbox" data-tf-element-role="consent-opt-in">I agree to terms</label><button type="button" id="ct-creative-submit-yes" ${verified ? 'onclick="this.setAttribute(\'aria-pressed\',\'true\')"' : ''}>Yes</button></div>`);
    try {
      const count=await handleAlphaIntentSoiCards(page,page.mainFrame(),{verificationTimeoutMs:60});
      assert.equal(await page.locator('input').isChecked(),true);
      assert.equal(await page.locator('.soi-card').getAttribute('data-ux-soi-done'),verified?'1':null);
      assert.equal(count,verified?2:1);
    } finally { await context.close(); }
  }
});

test('pageHasWork: returns true when page has Yes/No action buttons without text inputs', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, '<div><button type="button" class="btn-yes">Yes</button><button type="button">No</button></div>');
  t.after(() => context.close());
  assert.equal(await pageHasWork(page), true, 'Yes/No survey screens must remain actionable');
});

test('detectSmartFallbackAction: selects survey choice without requiring explicit pickRandom in config', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, '<button type="button" class="btn-yes question-answer-button" id="answer-yes">Yes</button>');
  t.after(() => context.close());
  const fallback = await detectSmartFallbackAction(page, { solveSurveyCards: true });
  assert.ok(fallback, 'Smart fallback must return an action for survey buttons');
  assert.equal(fallback.action, 'click');
});

test('findSubmitButton: recognizes Yes/No action buttons when no other fields exist', async () => {
  const mockYesBtn = {
    isVisible: async () => true,
    isEnabled: async () => true,
    innerText: async () => 'Yes',
    evaluate: async (fn) => fn({
      tagName: 'BUTTON',
      innerText: 'Yes',
      id: 'ct-creative-submit-yes',
      className: 'ct-creative-submit',
      closest: () => null,
      getAttribute: () => null,
      getBoundingClientRect: () => ({ top: 100, width: 200, height: 50 }),
    }),
  };

  const mockFrame = {
    locator: (sel) => ({
      all: async () => (sel.includes('button:has-text("Yes")') ? [mockYesBtn] : []),
    }),
  };

  const submitBtn = await findSubmitButton(mockFrame);
  assert.equal(submitBtn, mockYesBtn, 'findSubmitButton must recognize Yes button');
});
