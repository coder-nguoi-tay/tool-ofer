import { executeAction } from '../src/ai-assist/execute-action.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';
import { fillPageForms } from '../src/autofill/fill-page-forms.mjs';
import { solveSurveyStep } from '../src/survey-solver/solve-survey-step.mjs';

const record={title:'Mr',gender:'M',firstname:'Alice',lastname:'Example',dob:'04/15/1992',address:'123 Test Street',phone:'8175550111',email:'test@example.invalid',zipcode:'75001'};
/**
 * Quét fixture dựng theo cấu trúc thao tác tay, không phát request ra website thật.
 * @param {object} page Tab Chromium fixture.
 * @param {object} session Tiến độ phiên test.
 * @param {boolean} autoSubmit Có cho pipeline chính submit hay không.
 * @return {Promise<void>} Hoàn tất một lượt xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function scan(page,session,autoSubmit=true){await fillPageForms(page,{session,sessionRecord:record,options:{autoSubmit,enableLeadCheck:false,aiConfig:{enabled:false}},triggerLeadCheckAfterEmail(){}});}

test('đối chiếu các bước trả lời trong log thao tác tay bằng fixture không chứa dữ liệu thật',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 await t.test('title Mr/Ms, DOB, Continue mũi tên và YES Request My Review',async()=>{
  const html=readFileSync(new URL('./fixtures/recorded-answer-steps.html',import.meta.url),'utf8');const {context,page,session}=await createFormScopeFixture(browser,html);
  try{
   await scan(page,session);assert.equal(await page.locator('#title_select').inputValue(),'1');assert.equal(await page.locator('#dob').inputValue(),'1992-04-15');
   await scan(page,session);assert.equal(await page.locator('#registration').getAttribute('data-sent'),'1');assert.equal(await page.locator('#email').inputValue(),record.email);
  }finally{await context.close();}
 });
 await t.test('radio ID chứa dấu $ và select phụ hiện ra sau câu trả lời',async()=>{
  const {context,page,session}=await createFormScopeFixture(browser,'<form id="question"><fieldset><legend>Choose a product</legend><label><input type="radio" name="tmgControl$10822" id="tmgControl$10822$0" onchange="document.querySelector(\'#followup\').hidden=false">Pantene</label><label><input type="radio" name="tmgControl$10822" id="tmgControl$10822$1" onchange="document.querySelector(\'#followup\').hidden=false">Other brand</label></fieldset><div id="followup" hidden><select id="F_10822_81593"><option value="">Choose</option><option value="brand">Brand A</option><option value="none">None of the Above</option></select></div><button type="button">Continue</button></form>');
  try{await scan(page,session,false);await scan(page,session,false);assert.equal(await page.locator('input:checked').count(),1);assert.equal(await page.locator('select').inputValue(),'brand');}finally{await context.close();}
 });
 await t.test('chữ tiến độ 95% không phải câu trả lời hoặc bằng chứng hoàn tất',async()=>{
  const {context,page}=await createFormScopeFixture(browser,'<div id="question_1"><span id="value1">95% - One more step left!</span></div><a id="help" role="button" onclick="this.dataset.hit=1">What will I earn?</a>');
  try{const result=await solveSurveyStep(page.mainFrame());assert.equal(result.answeredCount,0);assert.equal(result.nextClicked,false);assert.equal(result.status,'unsupported');assert.equal((await executeAction(page,{action:'click',selector:'#help'},{},{allowSubmit:false})).reason,'not_answer_control');assert.equal(await page.locator('#help').getAttribute('data-hit'),null);}finally{await context.close();}
 });
});
