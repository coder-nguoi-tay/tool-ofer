import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { inspectNoSurvey } from '../src/autofill/adsmith/inspect-no-survey.mjs';
import { handleNoSurvey, ADSMITH_STUCK_RELOAD_MS } from '../src/autofill/adsmith/handle-no-survey.mjs';

const hasChromium = existsSync(chromium.executablePath());
const externalContinueLink = '<a id="next" href="https://blog.financialhelpfinder.com/path1f.php">Continue</a>';
const localContinueButton = '<button id="next" type="submit" form="survey">Continue</button>';

/**
 * Khảo sát Adsmith theo DOM thật (test.html 2026-11-15, đã bỏ dữ liệu cá nhân): .Processing là con trực tiếp của body,
 * ngoài .Wrap/.Survey; Continue preventDefault, bật màn mờ rồi chờ AJAX — AJAX ở đây không bao giờ trả về (mạng/proxy lỗi).
 */
const SURVEY = `<style>a,button{display:inline-block;padding:12px}.Qst{padding:10px}
  .Processing{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background-color:rgba(255,255,255,.5);z-index:99}</style>
  <div class="Wrap"><form id="survey" class="Survey"><div id="OP4" class="OfferPage Active">
    <div class="Qst" id="q1"><h3>Join YouGov?</h3><div class="Ans"><ul>
      <li class="Yes Active"><a>Yes</a></li><li class="No"><a>No</a></li></ul></div></div>
  </div></form>
  <div class="Btm"><div class="Buttons"><ul><li class="Next">CONTINUE_CONTROL</li></ul></div></div></div>
  <div class="Processing"></div>
  <script>
    window.continueClicks = 0;
    document.body.addEventListener('click', event => {
      if (!event.target.closest('#next')) return;
      event.preventDefault();
      window.continueClicks += 1;
      document.querySelector('.Processing').style.display = 'block';
      // $.ajax(TRACK_URL).done(() => top.location = HREF): không có .fail(), request treo → không bao giờ chuyển trang.
    });
  </script>`;

/**
 * Mở path1e.php với iframe AS_IFRAME plc=9235 chứa khảo sát trên.
 * @param {object} browser Chromium cục bộ dùng để chạy fixture đã chặn mạng bên ngoài.
 * @param {string} continueControl HTML của liên kết điều hướng hoặc nút submit thuộc form khảo sát.
 * @return {Promise<{page:object,frame:object,context:object,navigations:string[]}>} Tab, iframe và các điều hướng trang cha.
 * @throws {Error} Khi fixture chưa tải được trang hoặc control cần kiểm tra.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function openSurvey(browser, continueControl = localContinueButton) {
  const context = await browser.newContext();
  const navigations = [];
  await context.route('**/*', route => {
    const request = route.request();
    if (request.url().includes('/forge/')) return route.fulfill({ contentType: 'text/html', body: SURVEY.replace('CONTINUE_CONTROL', continueControl) });
    if (!request.isNavigationRequest()) return route.abort();
    navigations.push(request.url());
    return route.fulfill({ contentType: 'text/html', body: '<iframe id="AS_IFRAME" src="https://www.adsmith.io/forge/v4/?plc=9235" width="900" height="700"></iframe>' });
  });
  const page = await context.newPage();
  await page.goto('https://financialhelpfinder.com/path1e.php');
  await page.waitForFunction(() => document.querySelector('#AS_IFRAME'));
  const frame = page.frames().find(item => item.url().includes('/forge/'));
  await frame.waitForSelector('#next');
  return { page, frame, context, navigations };
}

test('màn mờ .Processing nằm ngoài .Survey vẫn được nhận là đang bận', { skip: !hasChromium }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { frame, context } = await openSurvey(browser);
  t.after(() => context.close());
  assert.equal((await frame.evaluate(inspectNoSurvey)).busy, false, 'chưa bấm Continue: không bận');
  await frame.evaluate(() => { document.querySelector('.Processing').style.display = 'block'; });
  assert.equal((await frame.evaluate(inspectNoSurvey)).busy, true, '.Processing hiện (ngoài .Survey): đang bận');
  await frame.evaluate(() => { const element = document.querySelector('.Processing'); element.style.display = 'block'; element.style.opacity = '0'; });
  assert.equal((await frame.evaluate(inspectNoSurvey)).busy, true, 'đang fadeIn (opacity 0) vẫn là bận');
});

test('Continue cạnh form trỏ sang trang khác: không gửi click và giữ trang cha', { skip: !hasChromium }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { page, frame, context, navigations } = await openSurvey(browser, externalContinueLink);
  t.after(() => context.close());
  const survey = await frame.evaluate(inspectNoSurvey);
  assert.equal(survey.busy, false);
  assert.equal(await frame.locator(survey.next).getAttribute('href'), 'https://blog.financialhelpfinder.com/path1f.php');
  for (let pass = 0; pass < 2; pass++) {
    assert.equal((await handleNoSurvey(frame, page)).actions, 0);
  }
  assert.equal(await frame.evaluate(() => window.continueClicks), 0);
  assert.deepEqual(navigations, ['https://financialhelpfinder.com/path1e.php']);
  assert.equal(page.url(), 'https://financialhelpfinder.com/path1e.php');
});

test('Continue nội bộ chỉ bấm một lần và giữ màn mờ cho đến ngưỡng tải lại', { skip: !hasChromium }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { page, frame, context, navigations } = await openSurvey(browser);
  t.after(() => context.close());
  const realNow = Date.now;
  let elapsed = 0;
  t.mock.method(Date, 'now', () => realNow() + elapsed);
  const logs = [];
  const options = { onLog: entry => logs.push(entry) };
  const clicks = () => frame.evaluate(() => window.continueClicks);

  const first = await handleNoSurvey(frame, page, options);
  assert.equal(await clicks(), 1, 'đã chọn đủ: bấm Continue');
  assert.equal(first.actions, 1);
  for (const at of [3_000, 6_000, 14_000, 17_000, 18_000, 22_000, 39_000]) {
    elapsed = at;
    const result = await handleNoSurvey(frame, page, options);
    assert.equal(result.actions, 0, `giây ${at / 1000}: màn mờ đang hiện, chỉ chờ`);
    assert.equal(await frame.locator('.Processing').isVisible(), true);
    assert.equal(await clicks(), 1);
  }
  assert.equal(logs.filter(entry => entry.type === 'submit_clicked').length, 1);
  assert.ok(!logs.some(entry => entry.type === 'adsmith_reclick_continue'));
  assert.deepEqual(navigations, ['https://financialhelpfinder.com/path1e.php'], 'không tự nhảy sang path1f.php');
  assert.equal(page.url(), 'https://financialhelpfinder.com/path1e.php');
  assert.equal(ADSMITH_STUCK_RELOAD_MS, 40_000);
});

test('tích hợp: autofill thật, Continue treo → F5 trang cha sau 40 giây (đồng hồ tua nhanh), khảo sát làm lại', { skip: !hasChromium }, async t => {
  const { attachAutofill } = await import('../src/autofill/attach-autofill.mjs');
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { page, context, navigations } = await openSurvey(browser);
  t.after(() => context.close());
  let offset = 0;
  const realNow = Date.now.bind(Date);
  t.mock.method(Date, 'now', () => realNow() + offset);
  const ticker = setInterval(() => { offset += 1_000; }, 200);
  t.after(() => clearInterval(ticker));
  const logs = [];
  const session = { slot: 1, mainPage: page, browser: context, exitIp: '198.51.100.12', addBrowserLog: entry => logs.push(entry) };
  attachAutofill(context, [{ firstname: 'Fixture' }], 'https://financialhelpfinder.com', session, { onLog: entry => logs.push(entry), autoSubmit: true, enableLeadCheck: false });
  const deadline = realNow() + 30_000;
  while (realNow() < deadline && (!logs.some(entry => entry.type === 'stuck_page_reload') || navigations.length < 2)) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  session.isClosed = true;
  const order = logs.map(entry => entry.type).filter(type => ['submit_clicked', 'adsmith_reclick_continue', 'stuck_page_reload'].includes(type));
  assert.ok(order.includes('stuck_page_reload'), `phải F5 khi màn mờ treo; log: ${order.join(', ')}`);
  assert.deepEqual(order.slice(0, order.indexOf('stuck_page_reload') + 1), ['submit_clicked', 'stuck_page_reload']);
  assert.deepEqual(navigations, Array(2).fill('https://financialhelpfinder.com/path1e.php'), 'trang cha tải lần đầu và tải lại đúng một lần');
  assert.ok(logs.find(entry => entry.type === 'stuck_page_reload').detail.includes('40 giây'));
});
