import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { fillPageForms } from '../src/autofill/fill-page-forms.mjs';

const QUESTIONS = 6;
const parent = '<html><body><div class="hero_section_h1">Thank you for your inquiry!</div><div id="AS_SURVEY"><iframe id="AS_IFRAME" src="https://www.adsmith.io/forge/v4/?plc=9235&lid=1" height="760" width="100%"></iframe></div>'
  + '<form id="AS_LOAD_FORM" style="display:none;"><input type="hidden" name="xxTrustedFormCertUrl" value="x"></form></body></html>';
const survey = '<style>.OfferPage{display:none}.OfferPage.Active{display:block}a{display:inline-block;padding:8px}.Processing{display:none}</style><div class="Survey"><div id="OP1" class="OfferPage Active">'
  + Array.from({ length: QUESTIONS }, (_, index) => `<div class="Qst" id="q${index}"><h3>Offer ${index}?</h3><div class="Ans"><ul><li class="Yes"><a onclick="this.closest('ul').querySelectorAll('li').forEach(e=>e.classList.remove('Active'));this.parentElement.classList.add('Active')">Yes</a></li><li class="No"><a onclick="this.closest('ul').querySelectorAll('li').forEach(e=>e.classList.remove('Active'));this.parentElement.classList.add('Active')">No</a></li></ul></div></div>`).join('')
  + '</div><div class="Btm"><div class="Buttons"><li class="Next"><a id="next" onclick="window.nextCount=(window.nextCount||0)+1">Continue</a></li></div></div><div class="Processing"></div></div>';

test('Adsmith (plc=9235): 6 câu được chọn Yes và Continue trong tối đa 3 lượt quét (trước đây 13 lượt)', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await context.route('**/*', route => {
    const url = route.request().url();
    route.fulfill({ contentType: 'text/html', body: url.includes('/forge/') ? survey : url.includes('path1c') ? parent : '' });
  });
  const page = await context.newPage();
  await page.goto('https://blog.financialhelpfinder.com/path1c.php');
  await page.waitForTimeout(300);
  const frame = page.frames().find(candidate => candidate.url().includes('adsmith'));
  const session = { slot: 1, offerMode: 'auto_full' };
  const options = { onLog: () => {}, autoSubmit: true, enableLeadCheck: false };
  let passes = 0;
  while (passes < 15 && !(await frame.evaluate(() => window.nextCount || 0))) {
    await fillPageForms(page, { session, sessionRecord: { email: 'a@b.c' }, options, triggerLeadCheckAfterEmail: () => {} });
    passes++;
    await page.waitForTimeout(500);
  }
  assert.equal(await frame.locator('#OP1 li.Yes.Active').count(), QUESTIONS);
  assert.equal(await frame.locator('#OP1 li.No.Active').count(), 0);
  assert.equal(await frame.evaluate(() => window.nextCount), 1);
  assert.ok(passes <= 3, `cần ${passes} lượt quét`);
});
