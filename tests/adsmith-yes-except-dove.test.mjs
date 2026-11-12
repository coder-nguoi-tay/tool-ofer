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

// DOM thật người dùng gửi (2026-11-12): câu Dove có data-as-oid="11105", đáp án là cặp a.Radio + a.Text,
// khung PopInfo là checkbox + select SMS (không phải radio).
const realAns = '<div class="Ans"><ul><li class="No"><a href="#" class="Radio"></a><a href="#" class="Text">No</a></li><li class="Yes"><a href="#" class="Radio"><span class="OhBoy"></span></a><a href="#" class="Text">Yes</a></li></ul></div>';
const checkPop = '<div class="PopInfo" style="display:none"><div class="Hug"><div class="PFQst ChecksField"><input type="checkbox" id="a11"><label for="a11">Bath &amp; Body Works</label></div><div class="PFQst SelectField"><select name="cq2"><option value="">---</option><option value="1">Yes</option></select></div><div class="Buttons"><ul><li class="Cancel"><a href="#">Cancel</a></li><li class="Save"><a href="#" onclick="window.saved=true">Save</a></li></ul></div></div></div>';
const realSurvey = `<style>a{display:inline-block;padding:8px}.OfferPage{display:none}.OfferPage.Active{display:block}</style>
<div class="Wrap"><div class="Survey" data-as-plc="9235"><div id="OP4" class="OfferPage Active">
  <div class="Qst HasPI VisMI" id="dove11105" data-as-oid="11105"><div class="Hug"><div class="TableArea"><div class="Cell Left"><div class="QstTitle">Sign up &amp; save on fall favorites!</div></div><div class="Cell Right">${realAns}</div></div></div>${checkPop}</div>
  <div class="Qst HasPI" id="checkpop" data-as-oid="5555"><div class="QstTitle">Get beauty samples?</div>${realAns}${checkPop}</div>
  <div class="Qst" id="plain" data-as-oid="2222"><div class="QstTitle">Lower your energy bill?</div>${realAns}</div>
</div></div>
<div class="Btm"><div class="Hug"><div class="Buttons"><ul><li class="Next"><a onclick="window.nextCount=(window.nextCount||0)+1">Continue</a></li></ul></div></div></div></div>${script}`;

test('Adsmith DOM thật: oid 11105 (Dove, không cần chữ "Dove") chọn No; Yes mở khung checkbox/select cũng đổi No; câu thường Yes', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext();
  t.after(() => context.close());
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: route.request().url().includes('/forge/') ? realSurvey : '<iframe id="AS_IFRAME" src="https://www.adsmith.io/forge/v4/?plc=9235" width="900" height="900"></iframe>' }));
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
  assert.equal(await frame.locator('#dove11105 li.No.Active').count(), 1, 'oid 11105 (Dove) phải chọn No');
  assert.equal(await frame.locator('#checkpop li.No.Active').count(), 1, 'Yes mở khung checkbox/select phải đổi sang No');
  assert.equal(await frame.locator('#plain li.Yes.Active').count(), 1, 'câu thường chọn Yes');
  assert.equal(await frame.evaluate(() => window.saved), undefined, 'không bấm Save');
  assert.equal(await frame.evaluate(() => window.nextCount || 0), 1, 'phải bấm Continue');
});

/**
 * Chạy iframe Adsmith giả với nội dung cho trước và trả frame + hàm quét.
 * @param {object} t Context node:test.
 * @param {string} body HTML bên trong iframe.
 * @return {Promise<{frame: object, scan: Function, logs: object[]}>} Frame và hàm quét một lượt.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
async function adsmithFrame(t, body) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext();
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: route.request().url().includes('/forge/') ? body : '<iframe id="AS_IFRAME" src="https://www.adsmith.io/forge/v4/?plc=9235" width="900" height="900"></iframe>' }));
  const page = await context.newPage();
  await page.goto('https://financialhelpfinder.com/path1e.php');
  const frame = page.frames()[1];
  const realNow = Date.now;
  let elapsed = 0;
  t.mock.method(Date, 'now', () => realNow() + elapsed);
  const logs = [];
  const scan = async (stepMs = 2000) => {
    elapsed += stepMs;
    await processFrameSurveys({ frame, page, record: {}, options: { onLog: entry => logs.push(entry) }, session: {}, frameProgress: { filledInThisPass: 0 } });
  };
  return { frame, scan, logs };
}

// Mô phỏng nút Next của survey-def-v2: thiếu đáp án ở .Qst bắt buộc → thêm NoAns + .Error.Active, không qua bước.
const nextValidates = scope => `<div class="Error" style="display:none">Please answer all questions</div>
<div class="Btm"><div class="Hug"><div class="Buttons"><ul><li class="Next"><a onclick="
  window.nextCount=(window.nextCount||0)+1;
  const missing=[...document.querySelectorAll('${scope}')].filter(q=>!q.querySelector('.Ans li.Active'));
  missing.forEach(q=>q.classList.add('NoAns'));
  const err=document.querySelector('.Error'); err.classList.toggle('Active', missing.length>0); err.style.display=missing.length?'block':'none';
  if(!missing.length) window.advanced=true;">Continue</a></li></ul></div></div></div>`;

test('Adsmith: khảo sát KHÔNG chia trang (không có .OfferPage) → trả lời mọi .Qst trong .Survey rồi Continue qua được', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  const body = `<style>a{display:inline-block;padding:8px}</style><div class="Wrap"><div class="Survey" data-as-plc="9235">
    <div class="Qst" id="q1"><div class="QstTitle">Lower your energy bill?</div>${realAns}</div>
    <div class="Qst" id="q2"><div class="QstTitle">Get a free quote?</div>${realAns}</div>
  </div>${nextValidates('.Survey .Qst')}</div>${script}`;
  const { frame, scan } = await adsmithFrame(t, body);
  for (let pass = 0; pass < 5 && !(await frame.evaluate(() => window.advanced)); pass++) await scan();
  assert.equal(await frame.locator('#q1 li.Yes.Active').count(), 1);
  assert.equal(await frame.locator('#q2 li.Yes.Active').count(), 1);
  assert.equal(await frame.evaluate(() => window.advanced), true, 'Continue phải qua được bước');
});

test('Adsmith: Continue bị website từ chối 2 lần → ghi log lỗi, chờ giãn rồi thử lại thay vì đứng yên mãi', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  // Website bỏ qua 2 lần bấm đầu (đang xử lý AJAX sau khi chọn đáp án), lần thứ 3 mới qua bước.
  const body = `<style>a{display:inline-block;padding:8px}.OfferPage{display:none}.OfferPage.Active{display:block}</style><div class="Wrap"><div class="Survey" data-as-plc="9235"><div id="OP1" class="OfferPage Active">
    <div class="Qst" id="q1"><div class="QstTitle">Lower your energy bill?</div>${realAns}</div></div></div>
    <div class="Error" style="display:none">Processing, please wait</div>
    <div class="Btm"><div class="Hug"><div class="Buttons"><ul><li class="Next"><a onclick="window.nextCount=(window.nextCount||0)+1; if(window.nextCount>=3) window.advanced=true; else { const e=document.querySelector('.Error'); e.classList.add('Active'); e.style.display='block'; }">Continue</a></li></ul></div></div></div></div>${script}`;
  const { frame, scan, logs } = await adsmithFrame(t, body);
  for (let pass = 0; pass < 8 && !(await frame.evaluate(() => window.advanced)); pass++) await scan(5000);
  assert.equal(await frame.evaluate(() => window.advanced), true, 'phải thử Continue lại sau khi chờ');
  assert.ok(logs.some(entry => entry.type === 'adsmith_continue_rejected' && /Processing, please wait/.test(entry.detail)), logs.map(entry => entry.type).join(','));
});
