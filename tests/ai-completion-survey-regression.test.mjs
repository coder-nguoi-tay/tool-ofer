import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';
import { resumeAutofillAfterAi } from '../src/browser/actions/resume-autofill-after-ai.mjs';
import { fillPageForms } from '../src/autofill/fill-page-forms.mjs';
import { solveSurveyCheckboxes } from '../src/survey-solver/solve-survey-checkboxes.mjs';
import { solveDropdownQuestions } from '../src/survey-solver/solve-dropdown-questions.mjs';
import { attachAutofillPageWatcher } from '../src/autofill/attach-autofill-page-watcher.mjs';
import { readVisiblePageState } from '../src/ai-assist/visible-state/read-visible-page-state.mjs';

const skip = !existsSync(chromium.executablePath());

test('hai launcher trả quyền về autofill, không còn nhánh đóng riêng dựa vào chữ cảm ơn sau AI', () => {
  for (const name of ['open-browser-with-installed-chrome', 'open-ads-power-browser']) {
    const source = readFileSync(new URL(`../src/browser/actions/${name}.mjs`, import.meta.url), 'utf8');
    const callback = source.slice(source.indexOf('onStuck:'));
    assert.match(callback, /then\(\(\) => resumeAutofillAfterAi/);
    assert.doesNotMatch(callback.split('activeBrowsers.add(session)')[0], /isThankYouPage|đã đạt trang cảm ơn|Đã hoàn tất đến trang cảm ơn/);
  }
  let scans = 0;
  const session = { triggerAutofillScan: () => scans++ };
  resumeAutofillAfterAi({ isClosed: () => false }, session);
  resumeAutofillAfterAi({ isClosed: () => true }, session);
  resumeAutofillAfterAi({ isClosed: () => false }, { ...session, isClosed: true });
  assert.equal(scans, 1);
});

test('Twy cq1: không ngẫu nhiên vẫn chọn đủ checkbox, không Continue sớm, không kẹt scope câu hỏi', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const html = `<h1>Thank you</h1><div id="twy-campaigns-12"><div class="twy-campaign-container-regular"><fieldset><legend>Receive updates?</legend><label><input type="radio" name="campaign" value="yes">Yes</label><label><input type="radio" name="campaign" value="no">No</label></fieldset><div class="twy-customquestion"><h3 class="twy-cqlabel">Please pick 2 choices</h3>${Array.from({ length: 11 }, (_, index) => `<label style="display:block"><input type="checkbox" name="cq1" id="5420" onchange="document.getElementById('twy-buttonnext-12').hidden=document.querySelectorAll('input[name=cq1]:checked').length<2">Choice ${index}</label>`).join('')}</div></div><div><button hidden type="button" id="twy-buttonnext-12" onclick="window.continued=document.querySelectorAll('input[name=cq1]:checked').length;this.closest('#twy-campaigns-12').hidden=true">Continue</button></div></div><aside><input type="checkbox" id="unrelated"></aside>`;
  const { context, page, session } = await createFormScopeFixture(browser, html);
  t.after(() => context.close());
  const run = () => fillPageForms(page, { session, sessionRecord: { firstname: 'Ada' }, options: { enableLeadCheck: false, autoSubmit: true, pickRandom: false }, triggerLeadCheckAfterEmail() { assert.fail('Không bật chờ lead'); } });
  await run();
  assert.equal(await page.locator('input[value=yes]').isChecked(), true);
  assert.equal(await page.evaluate(() => window.continued), undefined);
  await run();
  assert.equal(await page.locator('input[name=cq1]:checked').count(), 2);
  assert.equal(await page.locator('input[name=cq1]').nth(0).isChecked(), true);
  assert.equal(await page.locator('input[name=cq1]').nth(1).isChecked(), true);
  await run();
  assert.equal(await page.evaluate(() => window.continued), 2);
  assert.equal(await page.locator('#unrelated').isChecked(), false);
  assert.equal(context.pages().length, 1);
});

test('checkbox input ẩn có nhãn vẫn được chọn; giữ đáp án cũ và bổ sung khi yêu cầu pick 2', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, '<fieldset><legend>Please pick 2</legend><label><input style="display:none" type="checkbox" name="cq1" checked>First</label><label><input style="display:none" type="checkbox" name="cq1">Second</label><label><input style="display:none" type="checkbox" name="cq1">Third</label></fieldset>');
  t.after(() => context.close());
  assert.equal((await readVisiblePageState(page)).hasWork, true, 'Một đáp án chưa đủ yêu cầu hai');
  assert.equal(await solveSurveyCheckboxes(page.mainFrame(), { pickRandom: false }), 1);
  assert.equal(await page.locator('input:checked').count(), 2);
  assert.equal(await page.locator('input').first().isChecked(), true);
  assert.equal((await readVisiblePageState(page)).hasWork, false);
  assert.equal(await solveSurveyCheckboxes(page.mainFrame(), { pickRandom: false }), 0);
  assert.equal(await page.locator('input:checked').count(), 2);
});

test('kết thúc lượt AI trên trang có chữ Thank you vẫn tiếp tục form trong iframe, giữ các tab', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page, session } = await createFormScopeFixture(browser, '<h1>Thank you</h1><iframe srcdoc="<form><input name=firstname></form>"></iframe>');
  t.after(() => context.close());
  const other = await context.newPage();
  await other.goto('https://form-scope.test/other');
  let scan;
  session.triggerAutofillScan = () => { scan = fillPageForms(page, { session, sessionRecord: { firstname: 'Ada' }, options: { enableLeadCheck: false, autoSubmit: false }, triggerLeadCheckAfterEmail() {} }); };
  resumeAutofillAfterAi(page, session);
  await scan;
  assert.equal(await page.frameLocator('iframe').locator('input').inputValue(), 'Ada');
  assert.equal(context.pages().length, 2);
  assert.equal(session.isClosed, undefined);
});


test('select khảo sát placeholder -1 được click bằng chuột trước khi chọn, chế độ không ngẫu nhiên vẫn hoạt động', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, '<div id="twy-campaigns-12"><div class="twy-customquestion"><label>Product<select name="cq1" id="4812" onmousedown="window.selectMouseDown=(window.selectMouseDown||0)+1"><option value="-1">Please select</option><option value="one">First brand</option><option value="two">Second brand</option></select></label></div></div>');
  t.after(() => context.close());
  assert.equal((await readVisiblePageState(page)).hasWork, true);
  assert.equal(await solveDropdownQuestions(page.mainFrame(), { pickRandom: false }), 1);
  assert.equal(await page.locator('select').inputValue(), 'one');
  assert.ok(await page.evaluate(() => window.selectMouseDown > 0));
  assert.equal(await solveDropdownQuestions(page.mainFrame(), { pickRandom: false }), 0);
  assert.equal((await readVisiblePageState(page)).hasWork, false);
});

test('select chưa có option hợp lệ ghi lý do một lần và watchdog vẫn gọi hỗ trợ', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page, session } = await createFormScopeFixture(browser, '<div id="twy-campaigns-12"><label>Survey<select name="cq1" id="4812"><option value="-1">Please select</option><option value="pending" disabled>Loading</option></select></label></div>');
  t.after(() => context.close());
  const logs = [];
  for (let scan = 0; scan < 3; scan++) await solveDropdownQuestions(page.mainFrame(), { pickRandom: false, onLog: event => logs.push(event) });
  assert.equal(logs.filter(event => event.type === 'select_value_unmatched').length, 1);
  assert.equal(logs[0].reason, 'survey_options_unavailable');
  let aiRequests = 0;
  attachAutofillPageWatcher(page, { trackedPages: new WeakSet(), session, record: {}, options: { stuckThreshold: 1, libraryFirstPassDelayMs: 0, aiConfig: { enabled: false }, onStuck: () => aiRequests++, onLog: event => logs.push(event) }, fillVisibleForms: async () => {}, checkLeadAfterEmailOnPage() {}, isSpamAdUrl: () => false, watchPage() {} });
  const deadline = Date.now() + 2500;
  while (!aiRequests && Date.now() < deadline) { session.triggerAutofillScan?.(); await page.waitForTimeout(30); }
  assert.ok(aiRequests > 0, 'Select chưa chọn phải đánh thức hỗ trợ thay vì im lặng đứng');
});

test('select đã có câu trả lời vẫn đi tới Continue cùng widget, không bị scope câu hỏi giữ lại', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page, session } = await createFormScopeFixture(browser, '<h1>Thank you</h1><div id="twy-campaigns-12"><div class="twy-customquestion"><select name="cq1" id="4812"><option value="brand">Existing brand</option></select></div><div><button type="button" id="twy-buttonnext-12" onclick="window.continued=true">Continue</button></div></div>');
  t.after(() => context.close());
  await fillPageForms(page, { session, sessionRecord: { firstname: 'Ada' }, options: { autoSubmit: true, enableLeadCheck: false, pickRandom: false }, triggerLeadCheckAfterEmail() {} });
  assert.equal(await page.evaluate(() => window.continued), true);
  assert.equal(await page.locator('select').inputValue(), 'brand');
});
