import { handleRadioAndSurveyOptions } from '../src/autofill/handle-radio-and-survey-options.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';
import { safeSurveyClick } from '../src/survey-solver/safe-survey-click.mjs';
import { humanClick } from '../src/autofill/human-click.mjs';
import { solveRatingQuestions } from '../src/survey-solver/solve-rating-questions.mjs';
import { solveMatrixQuestions } from '../src/survey-solver/solve-matrix-questions.mjs';
import { solveSurveyCheckboxes } from '../src/survey-solver/solve-survey-checkboxes.mjs';
import { submitFrameForm } from '../src/autofill/submit-frame-form.mjs';
import { submitVisibleFormFallback } from '../src/autofill/submit-visible-form-fallback.mjs';

test('primitive không báo dispatched khi mọi nhánh click reject', async () => {
  const target = { click: async () => { throw new Error('rejected'); }, evaluate: async () => { throw new Error('rejected'); } };
  assert.equal(await safeSurveyClick(null,target),false);
  assert.equal(await humanClick(null,target),false);
});

test('survey xác minh native/ARIA và không tự tạo trạng thái selected', async t => {
  const browser = await chromium.launch({ headless:true });
  t.after(() => browser.close());
  for (const verified of [false,true]) await t.test(`rating verified=${verified}`, async () => {
    const {context,page}=await createFormScopeFixture(browser,`<div class="rating-scale">${[1,2,3,4,5].map(value=>`<button type="button" ${verified ? 'onclick="this.setAttribute(\'aria-pressed\',\'true\')"' : ''}>${value}</button>`).join('')}</div>`);
    try {
      assert.equal(await solveRatingQuestions(page.mainFrame(),{verificationTimeoutMs:80}),verified?1:0);
      assert.equal(await page.locator('.selected,.active').count(),0);
      if(verified) assert.equal(await solveRatingQuestions(page.mainFrame()),0);
    }finally{await context.close();}
  });
  await t.test('matrix chỉ tính hàng có native checked', async () => {
    const {context,page}=await createFormScopeFixture(browser,'<table class="matrix"><tr><td><input type="radio" name="one"></td><td><input type="radio" name="one"></td></tr></table>');
    try{assert.equal(await solveMatrixQuestions(page.mainFrame()),1);assert.equal(await page.locator('input:checked').count(),1);}finally{await context.close();}
  });
  await t.test('consent và select exactly 2 phải đủ lựa chọn',async()=>{
    const {context,page}=await createFormScopeFixture(browser,'<fieldset><legend>I agree to terms</legend><label><input type="checkbox">I agree to terms</label><label><input type="checkbox">I accept privacy</label></fieldset><fieldset><legend>Select exactly 2 choices</legend><label><input type="checkbox">A</label><label><input type="checkbox">B</label><label><input type="checkbox">C</label></fieldset>');
    try{assert.equal(await solveSurveyCheckboxes(page.mainFrame(),{pickRandom:true,maxPick:2}),2);assert.equal(await page.locator('fieldset').nth(0).locator('input:checked').count(),2);assert.equal(await page.locator('fieldset').nth(1).locator('input:checked').count(),2);}finally{await context.close();}
  });
});

test('submit click lỗi không đặt cờ màn/email và còn retry được',async t=>{
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const {context,page}=await createFormScopeFixture(browser,'<form id="main" onsubmit="event.preventDefault();this.dataset.sent=1"><input name="email" type="email" value="test@example.invalid"><button>Submit</button></form>');t.after(()=>context.close());
  const frame=page.mainFrame(), scope={active:true,nativeForm:true,rootSelector:'#main',memberSelector:':is(#main,#main *)'};frame._activeAutofillFormScope=scope;
  const logs=[],session={emailFilled:true};
  const locatorPrototype=Object.getPrototypeOf(page.locator('button')); const originalClick=locatorPrototype.click,down=page.mouse.down,up=page.mouse.up;
  const request={frame,page,session,record:{email:'test@example.invalid'},options:{autoSubmit:true,onLog:entry=>logs.push(entry)},frameProgress:{formScope:scope,frameHasEmail:true},screenInfo:{hasEmailInput:true},scanStartUrl:page.url()};
  try{
    locatorPrototype.click=async()=>{throw new Error('blocked');};page.mouse.down=async()=>{throw new Error('CDP failed');};page.mouse.up=async()=>{throw new Error('CDP failed');};
    await page.locator('button').evaluate(element=>{element.click=()=>{throw new Error('DOM failed');};});
    await submitFrameForm(request);
  }finally{locatorPrototype.click=originalClick;page.mouse.down=down;page.mouse.up=up;await page.locator('button').evaluate(element=>{delete element.click;});}
  assert.equal(session.hasSubmittedCurrentScreen,undefined);assert.equal(session.emailScreenSubmitted,undefined);assert.equal(session.firstSubmitHandled,undefined);assert.equal(session.autofillActions,undefined);
  assert.ok(logs.some(entry=>entry.type==='submit_attempt'));assert.ok(logs.some(entry=>entry.type==='submit_click_failed'));assert.ok(!logs.some(entry=>entry.type==='submit_clicked'));
  await page.locator('button').evaluate(element=>{element.dataset.uxLastSubmitTime='0';});
  await submitFrameForm(request);
  assert.equal(await page.locator('form').getAttribute('data-sent'),'1');assert.equal(session.emailScreenSubmitted,true);
});

test('fallback bỏ Back/Cancel/Skip/Privacy và không chọn nút mơ hồ',async t=>{
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const {context,page}=await createFormScopeFixture(browser,'<button id="back">Back</button><button>Cancel</button><button>Skip</button><button>Privacy</button><button id="next">Continue</button>');t.after(()=>context.close());
  assert.equal((await page.evaluate(submitVisibleFormFallback)).id,'next');
  await page.setContent('<button>Back</button><div role="button">Something</div>');assert.equal((await page.evaluate(submitVisibleFormFallback)).method,'none');
});

test('generic btn-option thực thi trong browser, không phụ thuộc biến Node và chỉ xử lý một lần',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const {context,page}=await createFormScopeFixture(browser,'<div class="answers"><h3>Choose a color</h3><button type="button" class="btn-option" onclick="this.setAttribute(\'aria-pressed\',\'true\')">Blue</button><button type="button" class="btn-option" onclick="this.setAttribute(\'aria-pressed\',\'true\')">Red</button></div>');t.after(()=>context.close());
 assert.equal(await handleRadioAndSurveyOptions(page.mainFrame(),{},{}),1);assert.equal(await page.locator('[aria-pressed=true]').count(),1);
 assert.equal(await handleRadioAndSurveyOptions(page.mainFrame(),{},{}),0);
});

test('survey không bấm nhầm submit và accordion; consent chỉ đếm checked thật',async t=>{
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const {context,page}=await createFormScopeFixture(browser,'<form onsubmit="event.preventDefault();this.dataset.sent=1"><input name="email" value="test@example.invalid"><button class="btn-option">Continue</button></form><button class="accordion-button" onclick="this.dataset.open=1">Where does my donation go to?</button>');t.after(()=>context.close());
  const frame=page.mainFrame();
  frame.url=()=> 'https://mercyships.org/';
  assert.equal(await handleRadioAndSurveyOptions(frame),0);
  assert.equal(await page.locator('form').getAttribute('data-sent'),null);
  assert.equal(await page.locator('.accordion-button').getAttribute('data-open'),null);
  await page.setContent('<label><input type="checkbox" name="consent">I agree</label>');
  frame.url=()=> 'https://displayoptoffers.com/';
  assert.equal(await handleRadioAndSurveyOptions(frame),1);
  assert.equal(await handleRadioAndSurveyOptions(frame),0);
  assert.equal(await page.locator('input').isChecked(),true);
  await page.setContent('<section class="screen" data-screen="q2"><h3>Who will use it?</h3><button type="button" class="option" onclick="this.setAttribute(\'aria-pressed\',\'true\')">Share with family</button><button type="button" class="option" onclick="this.setAttribute(\'aria-pressed\',\'true\')">Use it myself</button></section>');
  frame.url=()=> 'https://uplevelrewards.com/';
  assert.equal(await handleRadioAndSurveyOptions(frame),1);
  assert.equal(await page.locator('[aria-pressed=true]').innerText(),'Use it myself');
  assert.equal(await handleRadioAndSurveyOptions(frame),0);
});
