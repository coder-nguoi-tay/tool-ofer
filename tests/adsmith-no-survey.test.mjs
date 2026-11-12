import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { isNoSurveyFrame } from '../src/autofill/adsmith/is-no-survey-frame.mjs';
import { processFrameSurveys } from '../src/autofill/process-frame-surveys.mjs';
import { handleYesNoStep } from '../src/autofill/handle-yes-no-step.mjs';
import { handleAdsmithSurvey } from '../src/autofill/handle-adsmith-survey.mjs';
import { runAiAssist } from '../src/ai-assist/run-ai-assist.mjs';
import { executeAction } from '../src/ai-assist/execute-action.mjs';

test('quy tắc No chỉ khớp đúng iframe, placement và trang cha', async () => {
  const frame = { url: () => 'https://www.adsmith.io/forge/v4/?plc=9235', parentFrame: () => ({ url: () => 'https://blog.financialhelpfinder.com/path1c.php' }),
    frameElement: async () => ({ getAttribute: async () => 'AS_IFRAME', dispose: async () => {} }) };
  assert.equal(await isNoSurveyFrame(frame), true);
  for (const url of ['https://www.adsmith.io/forge/v4/?plc=9999', 'https://www.adsmith.io/else/?plc=9235', 'https://other.test/forge/v4/?plc=9235']) {
    assert.equal(await isNoSurveyFrame({ ...frame, url: () => url }), false);
  }
  assert.equal(await isNoSurveyFrame({ ...frame, parentFrame: () => null }), false);
  assert.equal(await isNoSurveyFrame({ ...frame, parentFrame: () => ({ url: () => 'https://other.test/' }) }), false);
  assert.equal(await isNoSurveyFrame({ ...frame, frameElement: async () => ({ getAttribute: async () => 'other', dispose: async () => {} }) }), false);
});

test('Adsmith (plc=9235) chọn Yes; câu mở khung radio (Dove) đổi sang No và đóng khung, rồi Continue; các iframe khác giữ Yes', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext();
  t.after(() => context.close());
  const survey = `<style>.OfferPage{display:none}.OfferPage.Active{display:block}a{display:inline-block;padding:12px}.Qst{padding:10px}.Processing{display:none}</style>
    <div class="Survey"><div id="OP1" class="OfferPage Active">
    ${[1, 2].map(index => `<div class="Qst" id="q${index}"><h3>Question ${index}</h3><div class="Ans"><ul>
    <li class="Yes ${index === 1 ? 'Active' : ''}"><a id="yes${index}" onclick="this.closest('ul').querySelectorAll('li').forEach(e=>e.classList.remove('Active'));this.parentElement.classList.add('Active')">Yes</a></li>
    <li class="No"><a id="no${index}" onclick="this.closest('ul').querySelectorAll('li').forEach(e=>e.classList.remove('Active'));this.parentElement.classList.add('Active');document.querySelector('.PopInfo').hidden=true">No</a></li></ul></div>${index === 1 ? '<div class="PopInfo"><label><input type="radio" name="hair"> Dry</label><label><input type="radio" name="hair"> Oily</label><a id="save" onclick="window.saved=true">Save</a></div>' : ''}</div>`).join('')}
    </div>
    <div id="OP2" class="OfferPage"><div class="Qst"><div class="Ans"><li class="No"><a id="hidden-no">No</a></li></div></div></div>
    <div class="Btm"><div class="Buttons"><li class="Next"><a id="next" onclick="window.nextCount=(window.nextCount||0)+1;window.validNext=document.querySelectorAll('#q1 li.No.Active').length===1&&document.querySelectorAll('#q2 li.Yes.Active').length===1">Continue</a></li></div></div><div class="Processing"></div></div>`;
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: route.request().url().includes('/forge/') ? survey : '<iframe id="AS_IFRAME" src="https://www.adsmith.io/forge/v4/?plc=9235" width="900" height="900"></iframe>' }));
  const page = await context.newPage();
  await page.goto('https://blog.financialhelpfinder.com/path1c.php');
  const frame = page.frames()[1];
  const realNow = Date.now;
  let elapsed = 0;
  t.mock.method(Date, 'now', () => realNow() + elapsed);
  const logs = [], session = {}, frameProgress = { filledInThisPass: 0 };
  const scan = async options => {
    elapsed += 2000;
    await processFrameSurveys({ frame, page, record: {}, options: { onLog: entry => logs.push(entry), ...options }, session, frameProgress });
  };
  await scan();
  // Một lượt chọn đủ mọi câu (trước đây một câu mỗi lượt, rất chậm); Continue ở lượt sau.
  // q1 đang Yes với khung radio + Save (dấu hiệu quảng cáo Dove) → đổi sang No; q2 câu thường → Yes.
  assert.equal(await frame.locator('#q1 li.No.Active').count(), 1);
  assert.equal(await frame.locator('#q2 li.Yes.Active').count(), 1);
  assert.equal(await frame.evaluate(() => window.nextCount), undefined);
  await scan({ autoSubmit: false });
  assert.equal(await frame.evaluate(() => window.nextCount), undefined);
  await scan();
  assert.equal(await frame.evaluate(() => window.validNext), true);
  assert.equal(await frame.evaluate(() => window.nextCount), 1);
  assert.equal(await frame.evaluate(() => window.saved), undefined);
  assert.equal(await frame.locator('#q1 li.Yes.Active').count(), 0);
  assert.equal(await frame.locator('#hidden-no').getAttribute('data-ux-adsmith-target'), null);
  await scan(); await scan(); await scan();
  assert.equal(await frame.evaluate(() => window.nextCount), 2, 'Không click Continue vô hạn hoặc đổi lại Yes');
  assert.equal(logs.filter(entry => entry.type === 'adsmith_no_waiting').length, 1);
  const aiLogs = [];
  await runAiAssist(page, {}, {}, { aiConfig: { enabled: true, mode: 'codex', cliBinary: '/nonexistent' }, onLog: entry => aiLogs.push(entry) });
  assert.equal(aiLogs.length, 0);
  assert.equal((await executeAction(page, { action: 'click', selector: '#yes1' })).reason, 'survey_owned_by_autofill');
  assert.equal(await handleAdsmithSurvey(page, page.mainFrame()), 0, 'Không click focus iframe bằng tọa độ');

  await frame.goto('https://www.adsmith.io/forge/v4/?plc=9999');
  assert.equal(await isNoSurveyFrame(frame), false);
  frame._activeAutofillFormScope = null;
  await frame.locator('#q1 li.Yes').evaluate(element => element.classList.remove('Active'));
  await handleYesNoStep({ frame, page });
  assert.ok(await frame.locator('#OP1 li.Yes.Active').count() > 0, 'Placement khác vẫn chọn Yes');
  assert.equal(await frame.locator('#OP1 li.No.Active').count(), 0);
});
