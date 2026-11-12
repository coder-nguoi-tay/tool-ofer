import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { processFrameSurveys } from '../src/autofill/process-frame-surveys.mjs';

const answers = '<ul><li class="Yes"><a onclick="this.closest(\'ul\').querySelectorAll(\'li\').forEach(e=>e.classList.remove(\'Active\'));this.parentElement.classList.add(\'Active\')">Yes</a></li><li class="No"><a onclick="this.closest(\'ul\').querySelectorAll(\'li\').forEach(e=>e.classList.remove(\'Active\'));this.parentElement.classList.add(\'Active\')">No</a></li></ul>';
const next = label => `<div class="Btm"><div class="Buttons"><li class="Next"><a id="next" onclick="window.nextCount=(window.nextCount||0)+1">${label}</a></li></div></div>`;
const CASES = {
  'nút Continue có ký tự phụ ("Continue »")': `<div class="Survey"><div id="OP1" class="OfferPage Active"><div class="Qst"><div class="Ans">${answers}</div></div></div>${next('Continue »')}</div>`,
  'có câu bắt buộc không có đáp án No': `<div class="Survey"><div id="OP1" class="OfferPage Active"><div class="Qst"><div class="Ans">${answers}</div></div><div class="Qst" id="age"><div class="Ans"><select><option>18-24</option></select></div></div></div>${next('Continue')}</div>`,
  'màn NoQuestions thật: .Survey rỗng, Continue ở .Btm ngoài': `<div class="Wrap"><div class="Survey" data-as-plc="9235"></div><div class="NoQuestions"><div class="Hold"><div class="NQ_TitleText">Sorry! You Didn't Qualify for This Step :(</div></div></div><div class="Btm"><div class="Hug"><div class="Buttons"><ul><li class="Next"><a id="next" onclick="window.nextCount=(window.nextCount||0)+1">Continue</a></li></ul></div></div></div></div>`,
  'iframe không có khối .Survey, chỉ có nút Continue': `<div class="Intro"><p>Thanks! A few more offers.</p><button id="next" onclick="window.nextCount=(window.nextCount||0)+1">Continue</button></div>`,
};

test('Adsmith AS_IFRAME (plc=9235): luôn bấm được nút tiếp tục, câu thường chọn Yes', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  for (const [name, survey] of Object.entries(CASES)) {
    await t.test(name, async st => {
      const context = await browser.newContext();
      st.after(() => context.close());
      await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: route.request().url().includes('/forge/') ? `<style>.OfferPage{display:none}.OfferPage.Active{display:block}a,button{display:inline-block;padding:10px}</style>${survey}` : '<iframe id="AS_IFRAME" src="https://www.adsmith.io/forge/v4/?plc=9235" width="900" height="700"></iframe>' }));
      const page = await context.newPage();
      await page.goto('https://blog.financialhelpfinder.com/path1c.php');
      const frame = page.frames()[1];
      const realNow = Date.now;
      let elapsed = 0;
      st.mock.method(Date, 'now', () => realNow() + elapsed);
      for (let pass = 0; pass < 4 && !(await frame.evaluate(() => window.nextCount || 0)); pass++) {
        elapsed += 2000;
        await processFrameSurveys({ frame, page, record: {}, options: { onLog: () => {} }, session: {}, frameProgress: { filledInThisPass: 0 } });
      }
      assert.equal(await frame.evaluate(() => window.nextCount || 0), 1, 'phải bấm nút tiếp tục');
      assert.equal(await frame.locator('li.No.Active').count(), 0, 'câu thường (không phải Dove) không chọn No');
    });
  }
});

test('Adsmith AS_IFRAME: câu chỉ có Yes và câu Yes/No thường đều chọn Yes, rồi Continue', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const pick = "this.closest('ul').querySelectorAll('li').forEach(e=>e.classList.remove('Active'));this.parentElement.classList.add('Active')";
  const survey = `<style>.OfferPage{display:none}.OfferPage.Active{display:block}a{display:inline-block;padding:10px}</style><div class="Survey"><div id="OP1" class="OfferPage Active">
    <div class="Qst" id="both"><div class="Ans"><ul><li class="Yes"><a onclick="${pick}">Yes</a></li><li class="No"><a onclick="${pick}">No</a></li></ul></div></div>
    <div class="Qst" id="yesOnly"><div class="Ans"><ul><li class="Yes"><a onclick="${pick}">Yes</a></li></ul></div></div>
  </div>${next('Continue')}</div>`;
  const context = await browser.newContext();
  t.after(() => context.close());
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: route.request().url().includes('/forge/') ? survey : '<iframe id="AS_IFRAME" src="https://www.adsmith.io/forge/v4/?plc=9235" width="900" height="700"></iframe>' }));
  const page = await context.newPage();
  await page.goto('https://blog.financialhelpfinder.com/path1c.php');
  const frame = page.frames()[1];
  const realNow = Date.now;
  let elapsed = 0;
  t.mock.method(Date, 'now', () => realNow() + elapsed);
  for (let pass = 0; pass < 4 && !(await frame.evaluate(() => window.nextCount || 0)); pass++) {
    elapsed += 2000;
    await processFrameSurveys({ frame, page, record: {}, options: { onLog: () => {} }, session: {}, frameProgress: { filledInThisPass: 0 } });
  }
  assert.equal(await frame.locator('#both li.Yes.Active').count(), 1, 'câu Yes/No thường chọn Yes');
  assert.equal(await frame.locator('#both li.No.Active').count(), 0);
  assert.equal(await frame.locator('#yesOnly li.Yes.Active').count(), 1, 'câu chỉ có Yes phải chọn Yes');
  assert.equal(await frame.evaluate(() => window.nextCount || 0), 1);
});

test('Adsmith AS_IFRAME: chọn xong phải bấm Continue dù nút không nằm trong .Btm và có khung PopInfo chỉ là chữ', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const pick = "this.closest('ul').querySelectorAll('li').forEach(e=>e.classList.remove('Active'));this.parentElement.classList.add('Active')";
  const variants = {
    'nút <button> ngoài .Btm': `<div class="Survey"><div id="OP1" class="OfferPage Active"><div class="Qst"><div class="Ans"><ul><li class="Yes"><a onclick="${pick}">Yes</a></li><li class="No"><a onclick="${pick}">No</a></li></ul></div></div></div><div class="Footer"><button type="button" class="btn-continue" onclick="window.nextCount=(window.nextCount||0)+1">Continue</button></div></div>`,
    'PopInfo đang hiện nhưng chỉ có chữ': `<div class="Survey"><div id="OP1" class="OfferPage Active"><div class="Qst"><div class="Ans"><ul><li class="Yes"><a onclick="${pick}">Yes</a></li><li class="No"><a onclick="${pick}">No</a></li></ul></div></div><div class="PopInfo"><p>By selecting Yes you agree to be contacted.</p></div></div>${next('Continue')}</div>`,
  };
  for (const [name, survey] of Object.entries(variants)) {
    await t.test(name, async st => {
      const context = await browser.newContext();
      st.after(() => context.close());
      await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: route.request().url().includes('/forge/') ? `<style>.OfferPage{display:none}.OfferPage.Active{display:block}a,button{display:inline-block;padding:10px}</style>${survey}` : '<iframe id="AS_IFRAME" src="https://www.adsmith.io/forge/v4/?plc=9235" width="900" height="700"></iframe>' }));
      const page = await context.newPage();
      await page.goto('https://blog.financialhelpfinder.com/path1c.php');
      const frame = page.frames()[1];
      const realNow = Date.now;
      let elapsed = 0;
      st.mock.method(Date, 'now', () => realNow() + elapsed);
      for (let pass = 0; pass < 4 && !(await frame.evaluate(() => window.nextCount || 0)); pass++) {
        elapsed += 2000;
        await processFrameSurveys({ frame, page, record: {}, options: { onLog: () => {} }, session: {}, frameProgress: { filledInThisPass: 0 } });
      }
      assert.equal(await frame.locator('li.Yes.Active').count(), 1);
      assert.equal(await frame.evaluate(() => window.nextCount || 0), 1, 'phải bấm Continue sau khi chọn đáp án');
    });
  }
});

test('Adsmith AS_IFRAME (DOM thật survey-def-v2): .Btm nằm NGOÀI .Survey → chọn Yes rồi bấm Continue', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const pick = "this.closest('ul').querySelectorAll('li').forEach(e=>e.classList.remove('Active'));this.parentElement.classList.add('Active')";
  // Cấu trúc lấy từ https://www.adsmith.io/forge/v4/?plc=9235&demo=1 (2026-11-12): .Btm là anh em của .Survey trong .Wrap.
  const survey = `<style>.OfferPage{display:none}.OfferPage.Active{display:block}a{display:inline-block;padding:10px}</style>
    <div class="Wrap"><div class="Survey" data-as-plc="9235"><div id="OP1" class="OfferPage Active">
      <div class="Qst"><div class="Ans"><ul><li class="Yes"><a onclick="${pick}">Yes</a></li><li class="No"><a onclick="${pick}">No</a></li></ul></div></div>
    </div></div>
    <div class="Btm"><div class="Hug"><div class="Buttons"><ul><li class="Next"><a onclick="window.nextCount=(window.nextCount||0)+1">Continue</a></li></ul></div></div></div></div>`;
  const context = await browser.newContext();
  t.after(() => context.close());
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: route.request().url().includes('/forge/') ? survey : '<iframe id="AS_IFRAME" src="https://www.adsmith.io/forge/v4/?plc=9235" width="900" height="700"></iframe>' }));
  const page = await context.newPage();
  await page.goto('https://blog.financialhelpfinder.com/path1c.php');
  const frame = page.frames()[1];
  const realNow = Date.now;
  let elapsed = 0;
  t.mock.method(Date, 'now', () => realNow() + elapsed);
  for (let pass = 0; pass < 4 && !(await frame.evaluate(() => window.nextCount || 0)); pass++) {
    elapsed += 2000;
    await processFrameSurveys({ frame, page, record: {}, options: { onLog: () => {} }, session: {}, frameProgress: { filledInThisPass: 0 } });
  }
  assert.equal(await frame.locator('li.Yes.Active').count(), 1);
  assert.equal(await frame.evaluate(() => window.nextCount || 0), 1, 'phải bấm Continue của .Btm ngoài .Survey');
});
