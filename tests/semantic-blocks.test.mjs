import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';
import { handleSurveySemanticQuestions } from '../src/autofill/handle-survey-semantic-questions.mjs';
import { processScopedWidgets } from '../src/autofill/form-scope/process-scoped-widgets.mjs';
import { handleAlphaIntentQuestions } from '../src/autofill/handle-alpha-intent-questions.mjs';

const option=(label)=>`<button type="button" class="btn-option question-answer-button" onclick="this.setAttribute('aria-pressed','true')">${label}</button>`;

test('semantic nhiều block theo record, giới hạn scope và chờ bước đang hiển thị',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 for(const wrappers of [true,false]) await t.test(`wrapper=${wrappers}`,async()=>{
  const age=wrappers?`<fieldset id="age"><legend>How old are you?</legend>${option('18-24')}${option('25-34')}</fieldset>`:`<h3>How old are you?</h3>${option('18-24')}${option('25-34')}`;
  const vehicle=wrappers?`<fieldset id="vehicle"><legend>What vehicle do you currently drive?</legend>${option('Car')}${option('Truck')}</fieldset>`:`<h3>What vehicle do you currently drive?</h3>${option('Car')}${option('Truck')}`;
  const {context,page}=await createFormScopeFixture(browser,`<form id="main">${age}${vehicle}</form><aside><h3>How old are you?</h3>${option('65+')}${option('45-54')}</aside>`);
  try{
   const frame=page.mainFrame();frame._activeAutofillFormScope={active:true,nativeForm:true,rootSelector:'#main',memberSelector:':is(#main,#main *)'};
   assert.equal(await processScopedWidgets({page,frame,record:{age:31,vehicle_type:'Truck'},options:{}}),2);
   assert.deepEqual(await page.locator('#main [aria-pressed=true]').allTextContents(),['25-34','Truck']);assert.equal(await page.locator('aside [aria-pressed=true]').count(),0);
  }finally{await context.close();}
 });
 await t.test('nhãn radio native giữ đúng nội dung đáp án theo record',async()=>{
  const {context,page}=await createFormScopeFixture(browser,'<form id="main"><fieldset><legend>How old are you?</legend><label><input type="radio" name="age">18-24</label><label><input type="radio" name="age">25-34</label></fieldset><fieldset><legend>What vehicle do you currently drive?</legend><label><input type="radio" name="vehicle">Car</label><label><input type="radio" name="vehicle">Truck</label></fieldset></form>');
  try{
   const frame=page.mainFrame();frame._activeAutofillFormScope={active:true,rootSelector:'#main',memberSelector:':is(#main,#main *)'};
   assert.equal(await handleSurveySemanticQuestions(page,frame,{record:{age:31,vehicle_type:'Truck'}}),2);
   assert.deepEqual(await page.locator('label:has(input:checked)').allTextContents(),['25-34','Truck']);
  }finally{await context.close();}
 });
 await t.test('opacity tổ tiên và click không đổi state không được tính answered',async()=>{
  const {context,page}=await createFormScopeFixture(browser,`<div id="main" style="opacity:0"><h3>How old are you?</h3>${option('18-24')}${option('25-34')}</div>`);
  try{
   const frame=page.mainFrame();frame._activeAutofillFormScope={active:true,rootSelector:'#main',memberSelector:':is(#main,#main *)'};
   assert.equal(await handleSurveySemanticQuestions(page,frame,{record:{age:31}}),0);assert.equal(await page.locator('[aria-pressed=true]').count(),0);
   await page.locator('#main').evaluate(element=>{element.style.opacity='1';for(const button of element.querySelectorAll('button'))button.removeAttribute('onclick');});frame._uxSemanticQAt=0;
   assert.equal(await handleSurveySemanticQuestions(page,frame,{record:{age:31},verificationTimeoutMs:60}),0);assert.equal(await page.locator('[data-ux-qclicked="1"]').count(),0);
  }finally{await context.close();}
 });
 await t.test('Alpha không dùng marker của chính tool để xác minh đáp án',async()=>{
  const {context,page}=await createFormScopeFixture(browser,'<div><h3>Choose a color</h3><button class="question-answer-button" type="button">Blue</button><button class="question-answer-button" type="button">Red</button></div>');
  try{assert.equal(await handleAlphaIntentQuestions(page,page.mainFrame(),{verificationTimeoutMs:60}),0);assert.equal(await page.locator('[data-ux-qclicked="1"]').count(),0);}finally{await context.close();}
 });
});
