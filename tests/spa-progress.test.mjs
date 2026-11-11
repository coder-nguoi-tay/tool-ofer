import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';
import { solveSurveyStep } from '../src/survey-solver/solve-survey-step.mjs';
import { runMultiStepSurveyLoop } from '../src/survey-solver/run-multi-step-survey-loop.mjs';
import { readQuestionState } from '../src/survey-solver/verification/read-question-state.mjs';

test('SPA nhận bước mới cùng URL, không nhầm checked với auto-advance và không double Next',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 await t.test('checked không đổi định danh câu hỏi và vẫn click Next',async()=>{
  const {context,page}=await createFormScopeFixture(browser,'<fieldset><legend>I agree to terms</legend><label><input type="checkbox">I agree to terms</label></fieldset><button type="button" id="next" onclick="this.dataset.hit=1">Next</button>');
  try{const before=await readQuestionState(page.mainFrame());const result=await solveSurveyStep(page.mainFrame());assert.equal(result.answeredCount,1);assert.equal(result.autoAdvanced,false);assert.equal(result.nextClicked,true);assert.equal((await readQuestionState(page.mainFrame())).identity,before.identity);assert.equal(await page.locator('#next').getAttribute('data-hit'),'1');}finally{await context.close();}
 });
 await t.test('câu hỏi đổi cùng URL không click Next của câu mới',async()=>{
  const {context,page}=await createFormScopeFixture(browser,'<main id="screen"><fieldset><legend>I agree to terms</legend><label><input type="checkbox" onchange="document.querySelector(\'#screen\').innerHTML=\'<h3>New question</h3><button type=&quot;button&quot; id=&quot;next&quot; onclick=&quot;this.dataset.hit=1&quot;>Next</button>\'">I agree to terms</label></fieldset></main>');
  try{const result=await solveSurveyStep(page.mainFrame());assert.equal(result.autoAdvanced,true);assert.equal(result.nextClicked,false);assert.equal(await page.locator('#next').getAttribute('data-hit'),null);}finally{await context.close();}
 });
 await t.test('unsupported, unverified và maxSteps không thành finished',async()=>{
  const {context,page}=await createFormScopeFixture(browser,'<h3>Unknown interactive widget</h3><button type="button">Answer A</button><button type="button">Answer B</button>');
  try{
   assert.equal((await solveSurveyStep(page.mainFrame())).status,'unsupported');
   const result=await runMultiStepSurveyLoop(page,{}, {stepDelayMs:0});assert.equal(result.finished,false);assert.equal(result.status,'unsupported');
   assert.equal((await runMultiStepSurveyLoop(page,{}, {maxSteps:0})).reason,'max_steps_reached');
   await page.setContent('<h3>Thank you, completed</h3>');assert.equal((await runMultiStepSurveyLoop(page)).finished,true);
  }finally{await context.close();}
 });
});
