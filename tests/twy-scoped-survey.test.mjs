import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';
import { handleTwyOfferCards } from '../src/autofill/handle-twy-offer-cards.mjs';
import { processFrameSurveys } from '../src/autofill/process-frame-surveys.mjs';
import { fillPageForms } from '../src/autofill/fill-page-forms.mjs';

const widget = `<style>label{display:block}.twy-hide{display:none}</style>
<div id="survey" class="twy-campaigns" data-ux-autofill-scope="survey"><div class="twy-campaign-container-regular" id="campaign">
<div id="radio-wrap"><label><input type="radio" name="campaign" id="twyinputyes-1680" value="yes">Yes</label><label><input type="radio" name="campaign" id="twyinputno-1680" value="no">No</label></div>
<div class="twy-customquestion" id="question"><h3 class="twy-cqlabel">Which descriptors apply to your household?</h3>
${Array.from({ length: 11 }, (_, index) => `<label><input type="checkbox" id="5420" name="cq1" value="${index}">Choice ${index}</label>`).join('')}</div>
</div><div id="next" class="twy-hide"><button id="twy-buttonnext-12" type="button" onclick="this.dataset.clicked=1">Continue</button></div></div>
<aside><input type="checkbox" id="side"><button class="twy-buttonnext" id="side-next" onclick="this.dataset.clicked=1">Continue</button></aside>`;
const scope = { active: true, memberSelector: ':is(#survey, #survey *)', rootSelector: '#survey', nativeForm: false };

test('Twy giữ handler trong form và không thao tác với campaign hoặc nút ẩn', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page, session } = await createFormScopeFixture(browser, widget);
  t.after(() => context.close());
  const frame = page.mainFrame();
  frame._activeAutofillFormScope = scope;
  page._activeAutofillFrame = frame;
  const logs = [];

  await t.test('scoped dispatch vẫn chọn radio campaign đang hiển thị', async () => {
    await processFrameSurveys({ frame, record: {}, options: { onLog: entry => logs.push(entry) }, page, session, frameProgress: { formScope: scope, filledInThisPass: 0 } });
    assert.ok(logs.some(log => log.type === 'twy_card_answered'));
    assert.equal(await page.locator('#radio-wrap input:checked').count(), 1);
    assert.equal(await page.locator('#side').isChecked(), false);
    assert.equal(await page.locator('#side-next').getAttribute('data-clicked'), null);
  });
  await t.test('radio ẩn và checkbox đã chọn không tạo click giả lên Continue ẩn', async () => {
    await page.locator('#radio-wrap').evaluate(element => { element.hidden = true; });
    const before = logs.filter(log => log.type === 'submit_clicked').length;
    assert.equal(await handleTwyOfferCards(frame, {}, { onLog: entry => logs.push(entry) }), 0);
    assert.equal(await page.locator('#twy-buttonnext-12').getAttribute('data-clicked'), null);
    assert.equal(logs.filter(log => log.type === 'submit_clicked').length, before);
  });
  await t.test('campaign chỉ có ID, không có class container, vẫn được nhận diện', async () => {
    await page.locator('#campaign').evaluate(element => { element.id = 'twy-campaign1680'; element.removeAttribute('class'); });
    await page.locator('#radio-wrap').evaluate(element => { element.hidden = false; for (const input of element.querySelectorAll('input')) input.checked = false; });
    await page.waitForTimeout(650);
    assert.equal(await handleTwyOfferCards(frame, {}, {}), 1);
    await page.locator('#radio-wrap').evaluate(element => { element.hidden = true; });
  });
  await t.test('Continue do widget hiện ra mới được click thật', async () => {
    await page.locator('#next').evaluate(element => element.classList.remove('twy-hide'));
    assert.equal(await handleTwyOfferCards(frame, {}, { onLog: entry => logs.push(entry) }), 1);
    assert.equal(await page.locator('#twy-buttonnext-12').getAttribute('data-clicked'), '1');
    assert.equal(await page.locator('#side-next').getAttribute('data-clicked'), null);
  });
});

test('các lượt autofill nhận 11 checkbox Twy là cùng một câu hỏi, giữ lựa chọn có sẵn', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page, session } = await createFormScopeFixture(browser, widget);
  t.after(() => context.close());
  await page.locator('#radio-wrap').evaluate(element => { element.hidden = true; });
  const record = { firstname: 'Alice', email: 'alice@example.invalid' };
  for (let scan = 0; scan < 2; scan++) await fillPageForms(page, { session, sessionRecord: record, options: { autoSubmit: false, enableLeadCheck: false, pickRandom: true }, triggerLeadCheckAfterEmail() {} });
  const checked = await page.locator('#question input:checked').count();
  assert.ok(checked >= 1 && checked <= 2, `Phải chọn có chừng mực, thực tế ${checked}/11`);
  assert.equal(await page.locator('#side').isChecked(), false);
  await page.locator('#question input').evaluateAll(inputs => inputs.forEach((input, index) => { input.checked = index === 8; input.removeAttribute('data-ux-multi-ticked'); }));
  for (let scan = 0; scan < 2; scan++) await fillPageForms(page, { session, sessionRecord: record, options: { autoSubmit: false, enableLeadCheck: false, pickRandom: true }, triggerLeadCheckAfterEmail() {} });
  assert.equal(await page.locator('#question input:checked').count(), 1);
  assert.equal(await page.locator('#question input').nth(8).isChecked(), true);
});
