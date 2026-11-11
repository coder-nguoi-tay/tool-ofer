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
