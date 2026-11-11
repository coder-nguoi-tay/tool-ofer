import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { fillPageForms } from '../src/autofill/fill-page-forms.mjs';
import { submitFrameForm } from '../src/autofill/submit-frame-form.mjs';
import { resolveActiveFormScope } from '../src/autofill/form-scope/resolve-active-form-scope.mjs';
import { hasActiveAddressSuggestions } from '../src/autofill/has-active-address-suggestions.mjs';
import { selectFirstAddressSuggestion } from '../src/autofill/select-first-address-suggestion.mjs';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';

const record = { firstname: 'Alice', email: 'alice@example.invalid' };
/**
 * Chạy lượt autofill thật trên form cục bộ với các dữ liệu kiểm thử đã xác định.
 * @param {object} page Tab Chromium cần quét.
 * @param {object} session Tiến độ của phiên hiện tại.
 * @param {object} options Tùy chọn submit cho bài kiểm tra.
 * @return {Promise<void>} Hoàn tất lượt điền, validation và submit.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function scanForm(page, session, options = {}) {
  await fillPageForms(page, { session, sessionRecord: record, options: { enableLeadCheck: false, ...options }, triggerLeadCheckAfterEmail() {} });
}

test('toàn bộ lượt điền giữ đúng phạm vi, iframe và vị trí cuộn', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  await t.test('điền/validation/checkbox/submit không đụng form phụ đang thiếu dữ liệu', async () => {
    const { context, page, session } = await createFormScopeFixture(browser, '<form id="main" onsubmit="event.preventDefault();this.dataset.submitted=1"><input name="firstname" value="Alice"><input type="email" name="email" value="alice@example.invalid"><button>Get Free Samples</button></form><form id="secondary" onsubmit="event.preventDefault();this.dataset.submitted=1"><input name="email" required><input type="checkbox" required id="side-consent"><button id="continue">Continue</button></form>');
    try {
      await scanForm(page, session);
      assert.equal(await page.locator('#main').getAttribute('data-submitted'), '1');
      assert.equal(await page.locator('#secondary input[type=email], #secondary input[name=email]').inputValue(), '');
      assert.equal(await page.locator('#side-consent').isChecked(), false);
      assert.equal(await page.locator('#secondary').getAttribute('data-submitted'), null);
    } finally { await context.close(); }
  });

  await t.test('quét lặp các ô đã đúng không cuộn xuống widget/footer', async () => {
    const { context, page, session } = await createFormScopeFixture(browser, '<form><input name="firstname" value="Alice"><input name="email" value="alice@example.invalid"><button>Continue</button></form><div style="height:2000px"></div><footer><div class="loco-widget"><input name="email"><button>Continue</button></div></footer>');
    try {
      session.lastObservedUrl = null;
      await scanForm(page, session, { autoSubmit: false });
      await scanForm(page, session, { autoSubmit: false });
      assert.equal(await page.evaluate(() => scrollY), 0);
      assert.equal(await page.locator('footer input').inputValue(), '');
    } finally { await context.close(); }
  });

  await t.test('ô nằm phía trên vùng nhìn thấy sau khi cuộn vẫn được điền, không bị coi là honeypot', async () => {
    const { context, page, session } = await createFormScopeFixture(browser, '<form><input name="firstname"><input name="email" value="alice@example.invalid"><div style="height:1800px"></div><button>Continue</button></form>');
    try {
      await page.evaluate(() => scrollTo(0, 900));
      await scanForm(page, session, { autoSubmit: false });
      assert.equal(await page.locator('input[name=firstname]').inputValue(), 'Alice');
      assert.ok(await page.evaluate(() => scrollY) < 100);
    } finally { await context.close(); }
  });

  await t.test('radio và nút giới tính của form phụ không bị chọn trong lượt quét form chính', async () => {
    const { context, page, session } = await createFormScopeFixture(browser, '<form id="main"><input name="firstname" value="Alice"><input name="email" value="alice@example.invalid"><fieldset><legend>Choose an answer</legend><label><input type="radio" name="answer" value="yes">Yes</label><label><input type="radio" name="answer" value="no">No</label></fieldset><button>Submit</button></form><form id="sidebar"><label><input id="side-radio" type="radio" name="answer" value="other">Other</label><button type="button" id="male" onclick="this.dataset.clicked=1">Male</button><input type="hidden" name="gender"></form>');
    try {
      await scanForm(page, session, { autoSubmit: false });
      assert.equal(await page.locator('#main input[type=radio]:checked').count(), 1);
      assert.equal(await page.locator('#side-radio').isChecked(), false);
      assert.equal(await page.locator('#male').getAttribute('data-clicked'), null);
    } finally { await context.close(); }
  });

  await t.test('iframe có form được xử lý trước CTA ở trang cha', async () => {
    const { context, page, session } = await createFormScopeFixture(browser, '<button id="continue" onclick="this.dataset.clicked=1">Continue</button><iframe></iframe>');
    try {
      const child = page.frames().find(frame => frame !== page.mainFrame());
      await child.setContent('<form onsubmit="event.preventDefault();this.dataset.submitted=1"><input name="firstname" value="Alice"><input type="email" name="email" value="alice@example.invalid"><button>Finish</button></form>');
      await scanForm(page, session);
      assert.equal(await child.locator('form').getAttribute('data-submitted'), '1');
      assert.equal(await page.locator('#continue').getAttribute('data-clicked'), null);
    } finally { await context.close(); }
  });

  await t.test('submit trong iframe không có nút không mượn nút của trang cha', async () => {
    const { context, page, session } = await createFormScopeFixture(browser, '<button id="continue" onclick="this.dataset.clicked=1">Continue</button><iframe></iframe>');
    try {
      const child = page.frames().find(frame => frame !== page.mainFrame());
      await child.setContent('<form onsubmit="event.preventDefault();this.dataset.submitted=1"><input value="done"></form>');
      await submitFrameForm({ options: {}, frame: child, page, session, frameProgress: { filledInThisPass: 1 }, record, screenInfo: {}, scanStartUrl: page.url() });
      assert.equal(await child.locator('form').getAttribute('data-submitted'), '1');
      assert.equal(await page.locator('#continue').getAttribute('data-clicked'), null);
    } finally { await context.close(); }
  });

  await t.test('iframe ở dưới vùng nhìn thấy chỉ được cuộn tới khi thao tác đúng nút của form', async () => {
    const { context, page, session } = await createFormScopeFixture(browser, '<div style="height:1500px"></div><iframe></iframe>');
    try {
      const child = page.frames().find(frame => frame !== page.mainFrame());
      await child.setContent('<form onsubmit="event.preventDefault();this.dataset.submitted=1"><input name="firstname" value="Alice"><input type="email" name="email" value="alice@example.invalid"><button>Finish</button></form>');
      await scanForm(page, session);
      assert.equal(await child.locator('form').getAttribute('data-submitted'), '1');
      assert.ok(await page.evaluate(() => scrollY) > 0);
    } finally { await context.close(); }
  });

  await t.test('menu địa chỉ ở body theo aria-controls vẫn được chọn, menu form phụ không bị chạm', async () => {
    const { context, page } = await createFormScopeFixture(browser, '<form><input id="address" name="address" aria-controls="owned-list"><button>Submit</button></form><div role="listbox" id="other-list"><div role="option" onclick="this.dataset.clicked=1">Wrong address</div></div><div role="listbox" id="owned-list"><div role="option" onclick="this.dataset.clicked=1">Right address</div></div>');
    try {
      await resolveActiveFormScope(page);
      assert.equal(await hasActiveAddressSuggestions(page, page), true);
      assert.equal(await selectFirstAddressSuggestion(page, page), true);
      assert.equal(await page.locator('#owned-list [role=option]').getAttribute('data-clicked'), '1');
      assert.equal(await page.locator('#other-list [role=option]').getAttribute('data-clicked'), null);
    } finally { await context.close(); }
  });
});
