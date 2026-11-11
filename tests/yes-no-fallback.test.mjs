import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';
import { handleYesNoStep } from '../src/autofill/handle-yes-no-step.mjs';

const skip = !existsSync(chromium.executablePath());
test('Yes hết, hai Continue không đổi bước thì No hết, không đụng nhóm ẩn và không lặp vô hạn', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, '<form id="survey">'+['one','two','concealed'].map(name=>`<fieldset ${name==='concealed'?'hidden':''}><legend>Question ${name}</legend><label><input type="radio" name="${name}" value="yes">Yes</label><label><input type="radio" name="${name}" value="no">No</label></fieldset>`).join('')+'<button type="button" onclick="window.continues=(window.continues||0)+1">Continue</button></form>');t.after(()=>context.close());
  const frame = page.mainFrame();frame._activeAutofillFormScope={active:true,rootSelector:'#survey',memberSelector:':is(#survey,#survey *)',nativeForm:true};
  let now=Date.now();t.mock.method(Date,'now',()=>now);
  const logs=[];const run=()=>handleYesNoStep({frame,page,options:{onLog:e=>logs.push(e)}});
  await run();await run();
  assert.equal(await page.locator('input[value=yes]:checked').count(),2);
  await run();assert.equal(await page.evaluate(()=>window.continues),1);
  await run();assert.equal(await page.evaluate(()=>window.continues),1,'Đang đợi phản hồi không click thêm');
  now+=2000;await run();assert.equal(await page.evaluate(()=>window.continues),2);
  now+=2000;await run();await run();
  assert.equal(await page.locator('input[value=no]:checked').count(),2);
  assert.equal(await page.locator('fieldset[hidden] input:checked').count(),0);
  await run();now+=2000;await run();now+=2000;await run();await run();
  assert.equal(await page.evaluate(()=>window.continues),4);
  assert.equal(logs.filter(e=>e.type==='survey_yes_no_fallback').length,1);
});

test('Continue chuyển bước thành công thì không đổi sang No ở bước cũ', { skip }, async t => {
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const {context,page}=await createFormScopeFixture(browser,'<form><fieldset><legend>Would you like updates?</legend><label><input name="answer" value="yes" type="radio">Yes</label><label><input name="answer" value="no" type="radio">No</label></fieldset><button type="button" onclick="this.closest(\'form\').hidden=true">Continue</button></form>');t.after(()=>context.close());
  const logs=[];const run=()=>handleYesNoStep({frame:page.mainFrame(),page,options:{onLog:e=>logs.push(e)}});
  await run();await run();assert.equal((await run()).handled,false);
  assert.equal(await page.locator('input[value=yes]').isChecked(),true);
  assert.equal(logs.some(e=>e.type==='survey_yes_no_fallback'),false);
});

test('Continue disabled không tính lượt và autoSubmit=false không gửi', { skip }, async t => {
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const {context,page}=await createFormScopeFixture(browser,'<fieldset><legend>Would you like updates?</legend><label><input type="radio" name="answer" value="yes">Yes</label><label><input type="radio" name="answer" value="no">No</label></fieldset><button disabled type="button">Continue</button>');t.after(()=>context.close());
  const logs=[];let now=Date.now();t.mock.method(Date,'now',()=>now);
  const run=options=>handleYesNoStep({frame:page.mainFrame(),page,options:{onLog:e=>logs.push(e),...options}});
  await run();for(let index=0;index<4;index++){now+=2000;await run();}
  assert.equal(await page.locator('input[value=yes]').isChecked(),true);
  assert.equal(logs.some(e=>e.type==='survey_yes_no_fallback'),false);
  await page.locator('button').evaluate(element=>element.disabled=false);
  await run({autoSubmit:false});
  assert.equal(logs.some(e=>e.type==='submit_clicked'),false);
});

test('Yes mở Save/Cancel: điền subform rồi Save, chờ đóng trước Continue, không bấm Cancel', { skip }, async t => {
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const {context,page}=await createFormScopeFixture(browser, `<form id="main"><fieldset><legend>Receive updates?</legend><label><input type="radio" name="answer" value="yes" onchange="document.getElementById('details').hidden=false">Yes</label><label><input type="radio" name="answer" value="no">No</label></fieldset><div id="details" hidden><input id="name" required><button type="button" id="save" onclick="window.saves=(window.saves||0)+1">Save</button><button type="button" id="cancel" onclick="window.cancelled=true">Cancel</button></div><button type="button" id="next" onclick="window.continued=true">Continue</button></form><form><button type="button" id="outside-save">Save</button><button>Cancel</button></form>`);t.after(()=>context.close());
  const frame=page.mainFrame();frame._activeAutofillFormScope={active:true,rootSelector:'#main',memberSelector:':is(#main,#main *)',nativeForm:true};
  let now=Date.now();t.mock.method(Date,'now',()=>now);const logs=[];
  const run=()=>handleYesNoStep({frame,page,options:{onLog:e=>logs.push(e)}});
  await run();assert.equal((await run()).waitingForInput,true);
  assert.equal(await page.evaluate(()=>window.continued),undefined);
  await page.locator('#name').fill('Ada');await run();
  assert.equal(await page.evaluate(()=>window.saves),1);
  await run();assert.equal(await page.evaluate(()=>window.saves),1);
  assert.equal(await page.evaluate(()=>window.continued),undefined);
  now+=2000;await run();now+=2000;await run();
  assert.equal(await page.evaluate(()=>window.saves),2);
  assert.equal(await page.evaluate(()=>window.continued),undefined);
  assert.equal(await page.evaluate(()=>window.cancelled),undefined);
  assert.ok(logs.some(e=>e.type==='survey_save_waiting'));
  await page.locator('#details').evaluate(element=>element.hidden=true);
  await run();assert.equal(await page.evaluate(()=>window.continued),true);
  assert.equal(logs.some(e=>e.type==='survey_yes_no_fallback'),false,'Save không tính thành lần Continue thất bại');
});


test('checkbox Yes/No có input ẩn: chọn đủ nhóm rồi mới Continue', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, '<form>' + ['one', 'two'].map(name => `<fieldset><legend>Question ${name}</legend><label><input style="display:none" type="checkbox" name="${name}-yes" value="yes">Yes</label><label><input style="display:none" type="checkbox" name="${name}-no" value="no">No</label></fieldset>`).join('') + '<button type="button" onclick="window.continued=Array.from(document.querySelectorAll(\'input[value=yes]\')).every(input=>input.checked)">Continue</button></form>');
  t.after(() => context.close());
  const run = () => handleYesNoStep({ frame: page.mainFrame(), page });
  await run();
  assert.equal(await page.evaluate(() => window.continued), undefined);
  await run();
  assert.equal(await page.locator('input[value=yes]:checked').count(), 2);
  assert.equal(await page.evaluate(() => window.continued), undefined);
  await run();
  assert.equal(await page.evaluate(() => window.continued), true);
});

test('nút link có wrapper riêng và class chosen không bị chọn lặp trước Continue', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, `<form>${['one', 'two'].map(name => `<section><h3>Question ${name}</h3><div><a href="#" onclick="event.preventDefault();this.classList.add('chosen');window.answers=(window.answers||0)+1">Yes</a></div><div><a href="#" onclick="event.preventDefault();this.classList.add('chosen')">No</a></div></section>`).join('')}<button type="button" onclick="window.continued=document.querySelectorAll('a.chosen').length===2">Continue</button></form>`);
  t.after(() => context.close());
  const run = () => handleYesNoStep({ frame: page.mainFrame(), page });
  await run(); await run();
  assert.equal(await page.evaluate(() => window.continued), undefined);
  assert.equal(await page.evaluate(() => window.answers), 2);
  await run();
  assert.equal(await page.evaluate(() => window.continued), true);
  assert.equal(await page.evaluate(() => window.answers), 2);
});
