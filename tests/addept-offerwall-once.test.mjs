import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { fillPageForms } from '../src/autofill/fill-page-forms.mjs';
import { isAddeptOfferwallFrame } from '../src/autofill/offerwall/is-addept-offerwall-frame.mjs';

const skip = !existsSync(chromium.executablePath());

/**
 * Offerwall Addept theo DOM thật (blissxo.com/125k-ow, 2026-11-16, bỏ dữ liệu cá nhân): thẻ .unit-card có nút
 * .unit-actions button.unit-button mở thẳng offer sang tab mới (mỗi lần một reqId khác nhau); bấm thân thẻ không
 * mở #infoPanel; nút đóng khung là #infoPanelClose.
 */
const OFFERS = [['Activate my card', 'W7SML2'], ['Claim Offer', '4Z3MTK'], ['Check Eligibility', 'X67FKK']];
const WALL = `<style>.unit-card{display:block;padding:12px;margin:8px;border:1px solid #ccc}.info-panel{display:none}</style>
  <div class="unit-stack">${OFFERS.map(([text, code], index) => `
    <div class="unit-card " data-index="${index}" data-view-tracked="true" data-creative-view-model='${JSON.stringify({ headline: `Offer ${index}`, url: `https://www.trk.test/2WCWQH/${code}/?source_id=pub` })}'>
      <h3 class="unit-headline">Offer ${index}</h3><div class="unit-description">Answer a few quick questions?</div>
      <div class="unit-actions"><button class="unit-button" data-i="${index}">${text}</button></div>
    </div>`).join('')}
  </div>
  <div class="info-panel" id="infoPanel"><button class="info-panel-close" id="infoPanelClose"></button><button class="info-panel-button" id="infoPanelButton"></button></div>
  <script>
    window.clicks = {};
    document.addEventListener('click', event => {
      const button = event.target.closest('.unit-button');
      if (!button) return;
      const index = button.dataset.i;
      window.clicks[index] = (window.clicks[index] || 0) + 1;
      const model = JSON.parse(button.closest('.unit-card').dataset.creativeViewModel);
      window.open(model.url + '&reqId=' + Math.random().toString(36).slice(2), '_blank');
    });
  </script>`;

test('nhận diện đúng iframe offerwall Addept', () => {
  assert.equal(isAddeptOfferwallFrame({ url: () => 'https://sdk.scrptk.com/content/render?pageUrl=https%3A%2F%2Fblissxo.com' }), true);
  for (const url of ['https://sdk.scrptk.com/other', 'https://evil.test/content/render', 'http://sdk.scrptk.com/content/render', 'https://sdk.scrptk.com.evil.test/content/render', '']) {
    assert.equal(isAddeptOfferwallFrame({ url: () => url }), false, url);
  }
  assert.equal(isAddeptOfferwallFrame(null), false);
});

test('trang cuối offerwall Addept (blissxo): mỗi offer chỉ bấm đúng một lần, không bị bộ trả lời khảo sát/submit bấm lại', { skip }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext();
  const opened = [];
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('sdk.scrptk.com')) return route.fulfill({ contentType: 'text/html', body: WALL });
    if (!route.request().isNavigationRequest()) return route.abort();
    if (url.includes('trk.test')) { opened.push(url); return route.fulfill({ contentType: 'text/html', body: '<main><form><input name="email"><button>Go</button></form></main>' }); }
    return route.fulfill({ contentType: 'text/html', body: '<h1>Spin the wheel</h1><iframe data-content-iframe="64" scrolling="no" src="https://sdk.scrptk.com/content/render?pageUrl=x" style="width:100%;height:900px"></iframe>' });
  });
  const page = await context.newPage();
  await page.goto('https://blissxo.com/125k-ow?game=lose');
  const frame = () => page.frames().find(item => item.url().includes('sdk.scrptk.com'));
  await frame().waitForSelector('.unit-button');
  const realNow = Date.now;
  let offset = 0;
  t.mock.method(Date, 'now', () => realNow() + offset);
  const session = { slot: 1, mainPage: page, browser: context, addBrowserLog() {}, autofillFields: 0, autofillActions: 0 };
  for (let round = 0; round < 12; round++) {
    offset += 6_000; // vượt nhịp chặn 2 giây của bộ offerwall và hạn chờ khung chi tiết
    await fillPageForms(page, { session, sessionRecord: { firstname: 'Fixture', email: 'fixture@example.test' }, options: { autoSubmit: true, enableLeadCheck: false }, triggerLeadCheckAfterEmail() {} });
    await page.waitForTimeout(150);
  }
  const clicks = await frame().evaluate(() => window.clicks);
  assert.deepEqual(clicks, { 0: 1, 1: 1, 2: 1 }, 'mỗi offer bấm đúng một lần, đủ cả ba offer');
  assert.equal(opened.length, 3, 'mở đúng 3 tab offer');
  assert.equal(await frame().locator('[data-ux-choice-id]').count(), 0, 'bộ trả lời khảo sát không đụng vào nút offer');
  assert.equal(await frame().locator('[data-ux-submitted]').count(), 0, 'bộ submit không bấm "Check Eligibility"');
  assert.equal(page.url(), 'https://blissxo.com/125k-ow?game=lose', 'trang cuối giữ nguyên');
});
