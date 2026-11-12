import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { performSurveyAnswer } from '../src/survey-solver/verification/perform-survey-answer.mjs';

// Rút gọn từ financialhelpfinder.com (2026-11-12): các bước Yes/No liên tiếp cùng nhãn nút, câu hỏi nằm trong div thường.
const page_html = `<form id="reg-data">
  <div class="sign_up" id="sign_up_step3"><div class="profile_question_body">Want to get noticed by employers?</div>
    <div class="yes_no_btns"><button type="button" class="yes" onclick="nextForm('sign_up_step4','sign_up_step3')">Yes</button><button type="button" class="no" onclick="nextForm('sign_up_step4','sign_up_step3')">No</button></div></div>
  <div class="sign_up" id="sign_up_step4" style="display:none"><div class="profile_question_body">Thinking about selling your home?</div>
    <div class="yes_no_btns"><button type="button" class="yes" onclick="nextForm('sign_up_step4a','sign_up_step4')">Yes</button><button type="button" class="no" onclick="nextForm('sign_up_step4a','sign_up_step4')">No</button></div></div>
  <div class="sign_up" id="sign_up_step4a" style="display:none"><div class="profile_question_body">Diabetes?</div></div>
</form><script>function nextForm(show, hide){document.getElementById(hide).style.display='none';document.getElementById(show).style.display='block';}</script>`;

test('Yes/No nhiều bước cùng nhãn nút: bấm No chuyển bước được xác nhận ngay (không bị coi là chưa xác nhận)', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(page_html);
  const logs = [];
  const result = await performSurveyAnswer(page.mainFrame(), page.locator('#sign_up_step3 button.no'), { onLog: entry => logs.push(entry.type) });
  assert.equal(await page.locator('#sign_up_step4').isVisible(), true);
  assert.equal(result.verified, true, JSON.stringify(result));
  assert.equal(result.reason, 'step_verified');
  assert.ok(!logs.includes('survey_selection_unverified'));
});
