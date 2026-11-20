import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';
import { fillPageForms } from '../src/autofill/fill-page-forms.mjs';
import { solveDropdownQuestions } from '../src/survey-solver/solve-dropdown-questions.mjs';
import { fillSelectOrTextField } from '../src/autofill/fill-select-or-text-field.mjs';
import { executeAction } from '../src/ai-assist/execute-action.mjs';
import { inspectAndFixFormWithAi } from '../src/ai-assist/inspect-and-fix-form-with-ai.mjs';
import { enforceMcpRepairPolicy } from '../src/ai-assist/repair/enforce-mcp-repair-policy.mjs';
import { resolveRecordCity } from '../src/autofill/record-values/resolve-record-city.mjs';

test('select giữ record qua hai lượt quét và không chọn option bừa',async t=>{
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const {context,page,session}=await createFormScopeFixture(browser,'<form><input type="email" value="test@example.invalid"><select name="state" id="state" required><option value="">Select</option><option value="CA">California</option><option value="TX">Texas</option></select><button>Continue</button></form>');t.after(()=>context.close());
  const logs=[],record={email:'test@example.invalid',state:'TX'};
  for(let scan=0;scan<2;scan++) await fillPageForms(page,{session,sessionRecord:record,options:{autoSubmit:false,enableLeadCheck:false,onLog:entry=>logs.push(entry)},triggerLeadCheckAfterEmail(){}});
  assert.equal(await page.locator('select').inputValue(),'TX');
  assert.equal(await solveDropdownQuestions(page.mainFrame()),0);assert.equal(await page.locator('select').inputValue(),'TX');
  await page.locator('select').evaluate(element=>{element.value='';element.removeAttribute('data-ux-filled');});
  record.state='ZZ';const fields=session.autofillFields;
  await fillPageForms(page,{session,sessionRecord:record,options:{autoSubmit:false,enableLeadCheck:false,onLog:entry=>logs.push(entry)},triggerLeadCheckAfterEmail(){}});
  assert.equal(await page.locator('select').inputValue(),'');assert.equal(session.autofillFields,fields);assert.ok(logs.some(entry=>entry.type==='select_value_unmatched'));
});

test('tháng 1 không khớp tiền tố tháng 10 đứng trước trong danh sách',async t=>{
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const {context,page}=await createFormScopeFixture(browser,'<select id="birthmonth"><option value="">Select</option><option value="10">10 - October</option><option value="1">January</option></select>');t.after(()=>context.close());
  const result=await fillSelectOrTextField({metadata:{kind:'select',id:'birthmonth',names:['birthmonth']},field:page.locator('select'),valueToFill:'1',page,options:{}});
  assert.equal(result.verified,true);assert.equal(await page.locator('select').inputValue(),'1');
});

test('custom dropdown mở bằng trigger và click option thay vì select gốc bị ẩn',async t=>{
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const html=`<form><select id="state" style="display:none"><option value="">Choose</option><option value="MA">Massachusetts</option></select><div id="trigger" role="combobox" tabindex="0" aria-expanded="false">Choose</div><div id="menu" role="listbox" style="display:none"><div role="option" data-value="MA">Massachusetts</div></div></form><script>
    window.mouseTargets=[];
    const select=document.querySelector('#state'),trigger=document.querySelector('#trigger'),menu=document.querySelector('#menu');
    document.addEventListener('mousedown',event=>mouseTargets.push(event.target.id||event.target.getAttribute('role')),true);
    trigger.addEventListener('click',()=>{menu.style.display='block';trigger.setAttribute('aria-expanded','true');});
    menu.firstElementChild.addEventListener('click',()=>{select.value='MA';select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));menu.style.display='none';trigger.textContent='Massachusetts';trigger.setAttribute('aria-expanded','false');});
  </script>`;
  const {context,page}=await createFormScopeFixture(browser,html);t.after(()=>context.close());
  const result=await fillSelectOrTextField({metadata:{kind:'select',id:'state',names:['state']},field:page.locator('#state'),page,frame:page.mainFrame(),valueToFill:'MA',options:{},session:{},frameProgress:{filledInThisPass:0},unmatchedFieldNames:new Set(),record:{state:'MA'}});
  assert.equal(result.verified,true);assert.equal(await page.locator('#state').inputValue(),'MA');
  assert.equal(await page.locator('#trigger').textContent(),'Massachusetts');assert.equal(await page.locator('#trigger').getAttribute('aria-expanded'),'false');
  assert.deepEqual(await page.evaluate(()=>window.mouseTargets),['trigger','option']);
});

test('repair thiếu record không tạo email/city mẫu và không submit',async t=>{
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const {context,page}=await createFormScopeFixture(browser,'<form onsubmit="event.preventDefault();this.dataset.sent=1"><input name="email" id="email" type="email" required><input name="city" required><button>Submit</button></form>');t.after(()=>context.close());
  const result=await inspectAndFixFormWithAi(page,{}, {},{aiConfig:{enabled:true,mode:'heuristic_only'},autoSubmit:true});
  assert.equal(result.fixed,false);assert.equal(result.status,'missing_record');assert.equal(await page.locator('#email').inputValue(),'');assert.equal(await page.locator('input[name=city]').inputValue(),'');assert.equal(await page.locator('form').getAttribute('data-sent'),null);
  assert.equal(resolveRecordCity({}), '');assert.equal(resolveRecordCity({state:'ZZ'}),'');assert.ok(resolveRecordCity({state:'TX'}));
});

test('executor chặn click submit dù AI đề xuất, sửa bằng assigned email thay cho giá trị bịa',async t=>{
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const {context,page}=await createFormScopeFixture(browser,'<form onsubmit="event.preventDefault();this.dataset.sent=1"><input name="email" id="email" type="email" required><button id="send">Continue</button></form>');t.after(()=>context.close());
  const policy={repairOnly:true,allowSubmit:false,record:{email:'provided@example.invalid'}},session={assignedEmail:'assigned@example.invalid'};
  assert.equal((await executeAction(page,{action:'click',selector:'#send'},session,policy)).reason,'submit_owned_by_autofill');
  assert.equal((await executeAction(page,{action:'fill',selector:'#email',value:'invented@example.invalid'},session,policy)).verified,true);
  assert.equal(await page.locator('#email').inputValue(),session.assignedEmail);assert.equal(await page.locator('form').getAttribute('data-sent'),null);
});

test('MCP repair không cho click/evaluate/Enter/giá trị ngoài record',()=>{
  for(const tool of ['browser_click','browser_navigate','browser_evaluate','browser_press_key','browser_run_code']) assert.throws(()=>enforceMcpRepairPolicy(tool,{},['provided']));
  assert.throws(()=>enforceMcpRepairPolicy('browser_type',{text:'invented'},['provided']));
  assert.throws(()=>enforceMcpRepairPolicy('browser_type',{text:'provided\n'},['provided\n']));
  const parameters={text:'provided',submit:true};enforceMcpRepairPolicy('browser_type',parameters,['provided']);assert.equal(parameters.submit,false);
});

test('AI tự động không vượt mode manual/skip/consent_only',async()=>{
 const {runAiAssist}=await import('../src/ai-assist/run-ai-assist.mjs');
 const page={isClosed:()=>false,evaluate:async()=>{throw new Error('Không được chạy DOM trong mode tắt');}};
 for(const offerMode of ['manual','skip','consent_only']){
  const session={offerMode};assert.equal((await inspectAndFixFormWithAi(page,{},session,{aiConfig:{enabled:true,mode:'heuristic_only'}})).status,'mode_disabled');
  await runAiAssist(page,{},session,{aiConfig:{enabled:true,mode:'heuristic_only'}});assert.equal(session.aiAssistRunning,undefined);
 }
});

test('agent điền select bằng record, nhường radio và nút cho autofill', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { page, context, session } = await createFormScopeFixture(browser, `<form>
    <label>State<select id="state"><option value="">Choose</option><option value="a">CA</option><option value="b">TX</option></select></label>
    <label><input type="radio" id="yes" name="choice">Yes</label>
    <button type="button" id="advance" onclick="this.dataset.clicked='1'">Continue</button></form>`);
  t.after(() => context.close());
  page._assignedRecord = { state: 'Texas' };
  const policy = { providedValuesOnly: true, allowSubmit: false, record: { state: 'CA' } };
  const selection = await executeAction(page, { action: 'select', selector: '#state', value: 'a' }, session, policy);
  assert.equal(selection.verified, true);
  assert.equal(await page.locator('#state').inputValue(), 'b');
  for (const action of ['check', 'click', 'fill', 'type']) {
    const result = await executeAction(page, { action, selector: '#yes', value: 'Texas' }, session, policy);
    assert.equal(result.ok, false);
  }
  assert.equal(await page.locator('#yes').isChecked(), false);
  assert.equal((await executeAction(page, { action: 'click', selector: '#advance' }, session, policy)).ok, false);
  assert.equal(await page.locator('#advance').getAttribute('data-clicked'), null);
});

test('repair nhả tab nếu app thay record giữa chẩn đoán và thao tác', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { page, context, session } = await createFormScopeFixture(browser, '<form><label>Postal code<input required></label></form>');
  t.after(() => context.close());
  page._assignedRecord = { zipcode: '01234' };
  const result = await inspectAndFixFormWithAi(page, page._assignedRecord, session, {
    aiConfig: { enabled: true, mode: 'heuristic_only' },
    onLog(event) { if (event.type === 'ai_form_diagnosing') page._assignedRecord = { zipcode: '99999' }; }
  });
  assert.equal(result.status, 'record_changed');
  assert.equal(await page.locator('input').inputValue(), '');
});

test('sửa theo nhãn của ô bị báo lỗi và chỉ xác nhận khi validator chấp nhận', async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { page } = await createFormScopeFixture(browser, `<meta charset="utf-8"><form>
    <label>Số điện thoại<input id="address" type="tel" aria-invalid="true"></label>
    <label>Địa chỉ<input id="phone" type="tel"></label></form>`);
  const record = { address: '10 Oak St', phone: '8175550147' };
  const policy = { repairOnly: true, record };
  const rejected = await executeAction(page, { action: 'fill', selector: '#address', value: record.address }, {}, policy);
  assert.equal((await page.locator('#address').inputValue()).replace(/\D/g, ''), record.phone);
  assert.equal(rejected.verified, false);
  assert.equal(rejected.reason, 'field_validation_pending');
  await page.locator('#address').evaluate(input => input.removeAttribute('aria-invalid'));
  assert.equal((await executeAction(page, { action: 'fill', selector: '#address' }, {}, policy)).verified, true);
  assert.equal((await executeAction(page, { action: 'fill', selector: '#phone', value: record.phone }, {}, policy)).ok, false);
  assert.equal(await page.locator('#phone').inputValue(), '');
  await page.locator('#phone').evaluate(field => { field.type = 'text'; });
  assert.equal((await executeAction(page, { action: 'fill', selector: '#phone', value: record.phone }, {}, policy)).verified, true);
  assert.equal(await page.locator('#phone').inputValue(), record.address);
});

test('giới hạn lần sửa trường không đổi, thử lại khi danh sách hoặc record thay đổi', async t => {
  const { rescueRequiredField } = await import('../src/autofill/form-scope/rescue-required-field.mjs');
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { page, session } = await createFormScopeFixture(browser, '<form><label>State<select id="state" required><option value="">Choose</option></select></label></form>');
  const frame = page.mainFrame();
  const { resolveActiveFormScope } = await import('../src/autofill/form-scope/resolve-active-form-scope.mjs');
  const formScope = await resolveActiveFormScope(frame);
  const logs = [];
  const record = { state: 'TX' };
  const args = { frame, page, fieldInfo: { id: 'state', type: 'select-one', reason: 'missing_required' },
    record, session, formScope, options: { onLog: entry => logs.push(entry) } };
  for (let pass = 0; pass < 4; pass++) assert.equal(await rescueRequiredField(args), false);
  assert.equal(logs.length, 2);
  record.state = 'CA';
  assert.equal(await rescueRequiredField(args), false);
  assert.equal(logs.length, 3);
  await page.locator('#state').evaluate(select => select.add(new Option('California', 'CA')));
  assert.equal(await rescueRequiredField(args), true);
  assert.equal(await page.locator('#state').inputValue(), 'CA');
});
