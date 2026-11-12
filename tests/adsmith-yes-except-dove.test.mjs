import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { processFrameSurveys } from '../src/autofill/process-frame-surveys.mjs';

// Mô phỏng script survey-def-v2 của Adsmith: chọn Yes ở câu có .PopInfo → thêm OpenPI và mở khung;
// chọn No → đóng khung (scripts.js dòng ~449 và ~475).
const script = `<script>
document.addEventListener('click', event => {
  const answer = event.target.closest('.Ans a'); if (!answer) return;
  const li = answer.parentElement, qst = li.closest('.Qst'), pop = qst.querySelector('.PopInfo');
  li.parentElement.querySelectorAll('li').forEach(item => item.classList.remove('Active'));
  li.classList.add('Active');
  if (pop && li.classList.contains('Yes')) { qst.classList.add('OpenPI'); pop.style.display = 'block'; }
  if (pop && li.classList.contains('No')) { qst.classList.remove('OpenPI'); pop.style.display = 'none'; }
});
</script>`;
const yesNo = '<div class="Ans"><ul><li class="Yes"><a>Yes</a></li><li class="No"><a>No</a></li></ul></div>';
const radioPop = '<div class="PopInfo" style="display:none"><div class="Hug"><label><input type="radio" name="hair" value="1"> Dry</label><label><input type="radio" name="hair" value="2"> Oily</label><div class="Buttons"><a onclick="window.saved=true">Save</a></div></div></div>';
const survey = `<style>a{display:inline-block;padding:10px}.OfferPage{display:none}.OfferPage.Active{display:block}</style>
<div class="Wrap"><div class="Survey" data-as-plc="9235"><div id="OP1" class="OfferPage Active">
  <div class="Qst" id="dove"><h3>Get free samples of Dove shampoo?</h3>${yesNo}${radioPop}</div>
  <div class="Qst" id="energy"><h3>Lower your energy bill?</h3>${yesNo}</div>
  <div class="Qst" id="nameless"><h3>Claim your free sample?</h3>${yesNo}${radioPop}</div>
</div></div>
<div class="Btm"><div class="Hug"><div class="Buttons"><ul><li class="Next"><a onclick="window.nextCount=(window.nextCount||0)+1">Continue</a></li></ul></div></div></div></div>${script}`;

test('Adsmith AS_IFRAME (plc=9235): chọn Yes hết, riêng quảng cáo Dove (khung radio + Save) chọn No, rồi Continue', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext();
  t.after(() => context.close());
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: route.request().url().includes('/forge/') ? survey : '<iframe id="AS_IFRAME" src="https://www.adsmith.io/forge/v4/?plc=9235" width="900" height="900"></iframe>' }));
  const page = await context.newPage();
  await page.goto('https://blog.financialhelpfinder.com/path1c.php');
  const frame = page.frames()[1];
  const realNow = Date.now;
  let elapsed = 0;
  t.mock.method(Date, 'now', () => realNow() + elapsed);
  for (let pass = 0; pass < 6 && !(await frame.evaluate(() => window.nextCount || 0)); pass++) {
    elapsed += 2000;
    await processFrameSurveys({ frame, page, record: {}, options: { onLog: () => {} }, session: {}, frameProgress: { filledInThisPass: 0 } });
  }
  assert.equal(await frame.locator('#dove li.No.Active').count(), 1, 'câu có chữ Dove phải chọn No');
  assert.equal(await frame.locator('#energy li.Yes.Active').count(), 1, 'câu thường phải chọn Yes');
  assert.equal(await frame.locator('#nameless li.No.Active').count(), 1, 'Yes mở khung radio + Save (dấu hiệu Dove) phải đổi sang No');
  assert.equal(await frame.locator('.PopInfo:visible').count(), 0, 'khung radio đã đóng');
  assert.equal(await frame.evaluate(() => window.saved), undefined, 'không bấm Save');
  assert.equal(await frame.evaluate(() => window.nextCount || 0), 1, 'phải bấm Continue');
});
