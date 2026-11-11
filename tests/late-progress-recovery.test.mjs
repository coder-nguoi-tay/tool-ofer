import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { getLateProgressRecoveryAction } from '../src/autofill/late-progress/get-recovery-action.mjs';
import { recoverEmptyProgress } from '../src/autofill/late-progress/recover-empty-progress.mjs';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';

test('mỗi phút trống F5 tối đa hai lượt rồi AI một lần; reload cùng URL không reset lượt', () => {
  const page = {}, snapshot = { empty: true }, url = 'https://offer.test/survey';
  assert.equal(getLateProgressRecoveryAction(page,url,snapshot,0).action,'waiting');
  assert.equal(getLateProgressRecoveryAction(page,url,snapshot,59999).action,'waiting');
  assert.equal(getLateProgressRecoveryAction(page,url,snapshot,60000).action,'reload');
  assert.equal(getLateProgressRecoveryAction(page,url+'?v=2',snapshot,120000).reloads,2);
  assert.equal(getLateProgressRecoveryAction(page,url,snapshot,180000).action,'ai');
  assert.equal(getLateProgressRecoveryAction(page,url,snapshot,240000).action,'exhausted');
  assert.equal(getLateProgressRecoveryAction(page,url,{empty:false},240001).action,'none');
  assert.equal(getLateProgressRecoveryAction(page,url,snapshot,240002).action,'waiting');
});

test('frame không đọc được không coi là trống liên tục; tab khác có bộ đếm riêng', () => {
  const page={},other={},url='https://offer.test/survey';
  getLateProgressRecoveryAction(page,url,{empty:true},0);
  assert.equal(getLateProgressRecoveryAction(page,url,null,50000).action,'none');
  assert.equal(getLateProgressRecoveryAction(page,url,{empty:true},60000).action,'waiting');
  assert.equal(getLateProgressRecoveryAction(other,url,{empty:true},120000).action,'waiting');
  assert.equal(getLateProgressRecoveryAction(page,url,{empty:true},120000).reloads,1);
});

test('trang 95% trống: reload hai lần, sau đó báo AI disabled; không mất cờ lead', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const {context,page}=await createFormScopeFixture(browser,'<h2>95% - One more step left!</h2>');t.after(()=>context.close());
  let now=Date.now();t.mock.method(Date,'now',()=>now);
  const session={leadCheckStatus:'confirmed',confirmedLeadIp:'192.0.2.90',exitIp:'192.0.2.90'}, logs=[];
  const options={aiConfig:{enabled:false},onLog:entry=>logs.push(entry)};
  for(let index=0;index<4;index++){await recoverEmptyProgress(page,session,options);now+=61000;}
  assert.equal(logs.filter(e=>e.type==='late_progress_reload').length,2);
  assert.equal(logs.filter(e=>e.type==='late_progress_ai_requested').length,1);
  assert.equal(logs.filter(e=>e.type==='late_progress_ai_disabled').length,1);
  await recoverEmptyProgress(page,session,options);
  assert.equal(logs.filter(e=>e.type==='late_progress_reload').length,2);
  assert.equal(session.leadCheckStatus,'confirmed');assert.equal(page.isClosed(),false);
  await page.setContent('<h2>95%</h2><iframe srcdoc="<form><input name=firstname></form>"></iframe>');
  assert.equal(await recoverEmptyProgress(page,session,options),false,'Form trong iframe phải được điền, không reload');
  await page.setContent('<h2>100% completed</h2>');
  assert.equal(await recoverEmptyProgress(page,session,options),false);
});


test('tiến độ từ 80 lên 95 là bước mới, bắt đầu lại một phút chờ', () => {
  const page={},url='https://offer.test/survey';
  getLateProgressRecoveryAction(page,url,{empty:true,frames:[{progress:80}]},0);
  assert.equal(getLateProgressRecoveryAction(page,url,{empty:true,frames:[{progress:95}]},59000).action,'waiting');
  assert.equal(getLateProgressRecoveryAction(page,url,{empty:true,frames:[{progress:95}]},60000).action,'waiting');
  assert.equal(getLateProgressRecoveryAction(page,url,{empty:true,frames:[{progress:95}]},119000).reloads,1);
});
