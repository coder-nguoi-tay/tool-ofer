import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';
import { resolveActiveFormScope } from '../src/autofill/form-scope/resolve-active-form-scope.mjs';
import { ensureAvailableFormScope } from '../src/autofill/form-scope/ensure-available-form-scope.mjs';
import { executeAction } from '../src/ai-assist/execute-action.mjs';
import { resolveActionTarget } from '../src/ai-assist/resolve-action-target.mjs';
import { readVisiblePageState } from '../src/ai-assist/visible-state/read-visible-page-state.mjs';
import { blockAiForState, inspectAiStateGate } from '../src/ai-assist/retry/ai-state-gate.mjs';
import { runAiAssist } from '../src/ai-assist/run-ai-assist.mjs';
import { fillPageForms } from '../src/autofill/fill-page-forms.mjs';

test('câu hỏi có radio ẩn và label hiện phục hồi scope trước khi chọn rồi Continue', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page, session } = await createFormScopeFixture(browser, `<style>input[type=radio],.twy-hide{display:none}label{display:block;padding:12px}</style>
    <div id="twy-campaigns-12"><h3>Do you want more information?</h3>
    <input id="yes" type="radio" name="answer" value="yes" onchange="document.querySelector('#next').className=''"> <label for="yes">Yes</label>
    <input id="no" type="radio" name="answer" value="no"><label for="no">No</label>
    <div id="next" class="twy-hide"><button id="continue" onclick="this.dataset.clicked='1'">Continue</button></div>
    <div hidden><label><input id="old" type="radio" name="old">Old question</label></div></div>
    <footer><button id="footer">Continue</button><input name="email"></footer>`);
  t.after(() => context.close());
  const frame = page.mainFrame();
  page._activeAutofillFrame = frame;
  const scope = await resolveActiveFormScope(frame);
  assert.equal(scope.active, true);
  assert.equal(scope.visibleFieldCount, 2);
  assert.equal(await page.locator(scope.rootSelector).getAttribute('id'), 'twy-campaigns-12');
  assert.equal((await resolveActionTarget(page, '#continue')).reason, 'element_not_visible');

  const initial = await readVisiblePageState(page);
  blockAiForState(page, initial.signature);
  assert.equal(inspectAiStateGate(page, initial).allowed, false);
  frame._activeAutofillFormScope = { ...scope, active: false, unavailable: true };
  const recovered = await readVisiblePageState(page);
  assert.equal(recovered.hasWork, true);
  assert.notEqual(recovered.signature, initial.signature);
  assert.equal(inspectAiStateGate(page, recovered).allowed, true);
  blockAiForState(page, recovered.signature);
  assert.equal(inspectAiStateGate(page, await readVisiblePageState(page)).allowed, false);

  frame._activeAutofillFormScope = { ...scope, active: false, unavailable: true };
  assert.equal((await executeAction(page, { action: 'check', selector: '#yes' })).ok, true);
  assert.equal(await page.locator('#yes').isChecked(), true);
  assert.equal((await resolveActionTarget(page, '#old')).reason, 'element_not_visible');
  assert.equal((await resolveActionTarget(page, '#footer')).reason, 'selector_not_found');
  assert.equal((await executeAction(page, { action: 'click', selector: '#continue' })).ok, true);
  assert.equal(await page.locator('#continue').getAttribute('data-clicked'), '1');

  await page.evaluate(() => {
    document.querySelector('#yes').checked = false;
    document.querySelector('#next').className = 'twy-hide';
    delete document.querySelector('#continue').dataset.clicked;
  });
  for (let scan = 0; scan < 2; scan++) await fillPageForms(page, { session, sessionRecord: {}, options: { enableLeadCheck: false }, triggerLeadCheckAfterEmail() {} });
  assert.equal(await page.locator('#yes').isChecked(), true);
  assert.equal(await page.locator('#continue').getAttribute('data-clicked'), '1');
  assert.equal(await page.locator('footer input').inputValue(), '');
});

test('scope chưa phục hồi không được quét global và gộp các lượt xác định lại đồng thời', async () => {
  let inspections = 0;
  const frame = { _activeAutofillFormScope: { active: false, unavailable: true }, evaluate: async () => {
    inspections++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return null;
  }, locator: () => { assert.fail('Không được tìm control ngoài scope'); } };
  assert.deepEqual(await Promise.all([ensureAvailableFormScope(frame), ensureAvailableFormScope(frame)]), [false, false]);
  assert.equal(inspections, 1);
  assert.equal((await resolveActionTarget(frame, '#choice')).reason, 'scope_unavailable');
  const state = await readVisiblePageState(frame);
  assert.equal(state.available, false);
  assert.equal(inspectAiStateGate(frame, state).reason, 'scope_unavailable');
});

test('mất scope giữa lượt AI trả quyền autofill, không tiêu ba vòng thử hoặc khóa trạng thái', async () => {
  const logs = [];
  let scans = 0;
  const scope = { active: true, rootSelector: '#survey', memberSelector: '#survey *' };
  const page = { url: () => 'https://form-scope.test/question', isClosed: () => false,
    _activeAutofillFormScope: scope,
    evaluate: async fn => {
      if (fn.name === 'inspectVisibleInteractions') return { controls: [{ tag: 'input', type: 'checkbox', selector: '#choice', checked: false }], questions: [], errors: [] };
      if (fn.name === 'selectActiveForm') return null;
      page._activeAutofillFormScope = { ...scope, active: false, unavailable: true };
      return { action: 'check', selector: '#choice' };
    } };
  const session = { triggerAutofillScan: () => scans++ };
  await runAiAssist(page, {}, session, { aiConfig: { enabled: true, mode: 'heuristic_only' }, onLog: entry => logs.push(entry) });
  assert.equal(logs.filter(entry => entry.type === 'ai_started').length, 1);
  assert.equal(logs.filter(entry => entry.type === 'ai_scope_waiting').length, 1);
  assert.equal(logs.filter(entry => entry.type === 'ai_watchdog_fallback').length, 0);
  assert.equal(session.aiAssistRunning, false);
  assert.equal(page._aiAssistRunning, false);
  assert.equal(scans, 1);
  page._activeAutofillFormScope = scope;
  assert.equal(inspectAiStateGate(page, await readVisiblePageState(page)).allowed, true);
});
