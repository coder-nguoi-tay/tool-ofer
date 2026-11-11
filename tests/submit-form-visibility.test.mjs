import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { chromium } from 'playwright';
import { submitFrameForm } from '../src/autofill/submit-frame-form.mjs';
import { submitVisibleFormFallback } from '../src/autofill/submit-visible-form-fallback.mjs';

/**
 * Quét submit như ứng dụng thật sau khi vừa điền xong một trường.
 * @param {import('playwright').Page} page Trang Chromium cục bộ cần kiểm tra.
 * @return {Promise<object>} Trạng thái phiên sau lượt quét.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function scanCompletedForm(page) {
  const session = { firstSubmitHandled: true, completedScreens: 2 };
  await submitFrameForm({
    options: {}, frame: page, page, session,
    frameProgress: { filledInThisPass: 1 }, record: {}, screenInfo: {}, scanStartUrl: page.url(),
  });
  return session;
}

test('submit chỉ tương tác form đang hiển thị và sẵn sàng trên Chromium', {
  skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium cho Playwright',
}, async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/*', route => route.abort());

  await t.test('form đã submit và ẩn không bị gửi lại hoặc hiện lại qua fallback', async () => {
    await page.setContent(`<form onsubmit="event.preventDefault(); document.body.dataset.submits = String(Number(document.body.dataset.submits || 0) + 1); this.hidden = !this.hidden">
      <input value="already-filled"><button type="submit">Submit</button>
    </form>`);
    const submittedSession = await scanCompletedForm(page);
    assert.equal(submittedSession.hasSubmittedCurrentScreen, true);
    assert.equal(submittedSession.autofillActions, 1);
    assert.equal(await page.locator('form').isVisible(), false);
    const session = await scanCompletedForm(page);
    assert.equal(await page.locator('body').getAttribute('data-submits'), '1');
    assert.equal(await page.locator('form').isVisible(), false);
    assert.equal(session.hasSubmittedCurrentScreen, undefined);
  });

  for (const hiddenStyle of ['display:none', 'visibility:hidden', 'opacity:0']) {
    await t.test(`bỏ qua form có phần tử cha ${hiddenStyle}`, async () => {
      await page.setContent(`<section style="${hiddenStyle}"><form onsubmit="event.preventDefault(); this.dataset.submitted = 'true'">
        <input value="done"><button>Submit</button></form></section>`);
      assert.equal((await page.evaluate(submitVisibleFormFallback)).method, 'none');
      assert.equal(await page.locator('form').getAttribute('data-submitted'), null);
    });
  }

  for (const state of ['disabled', 'aria-disabled="true"', 'aria-busy="true"']) {
    await t.test(`không gửi dự phòng khi nút đang ${state}`, async () => {
      await page.setContent(`<form onsubmit="event.preventDefault(); this.dataset.submitted = 'true'">
        <input value="done"><button type="submit" ${state}>Submit</button></form>`);
      await scanCompletedForm(page);
      assert.equal(await page.locator('form').getAttribute('data-submitted'), null);
      assert.equal(await page.locator('button').getAttribute(state.split('=')[0]), state === 'disabled' ? '' : 'true');
    });
  }

  await t.test('form đang xử lý và fieldset khóa không bị requestSubmit', async () => {
    for (const content of [
      '<form aria-busy="true"><input value="done"></form>',
      '<form><fieldset disabled><input value="done"><button>Submit</button></fieldset></form>',
    ]) {
      await page.setContent(content);
      assert.equal((await page.evaluate(submitVisibleFormFallback)).method, 'none');
    }
  });

  await t.test('form nhiều bước gửi bước đang mở, bỏ qua bước trước đã ẩn và chống gửi dồn', async () => {
    await page.setContent(`<form hidden id="previous" onsubmit="event.preventDefault(); this.dataset.submitted='true'"><input value="previous"></form>
      <form id="current" onsubmit="event.preventDefault(); this.dataset.submits=String(Number(this.dataset.submits || 0) + 1)"><input required value="ready"></form>`);
    assert.equal((await page.evaluate(submitVisibleFormFallback)).id, 'current');
    assert.equal((await page.evaluate(submitVisibleFormFallback)).method, 'none');
    assert.equal(await page.locator('#previous').getAttribute('data-submitted'), null);
    assert.equal(await page.locator('#current').getAttribute('data-submits'), '1');
  });

  await t.test('form chưa hợp lệ hoặc còn lỗi không bị gửi dự phòng', async () => {
    for (const content of ['<textarea required></textarea>', '<input value="ready"><p class="error-message">Invalid address</p>']) {
      await page.setContent(`<form>${content}</form>`);
      assert.equal((await page.evaluate(submitVisibleFormFallback)).method, 'none');
    }
  });

  await t.test('trang không có form chỉ click nút dự phòng đang hiển thị', async () => {
    await page.setContent('<button hidden onclick="this.dataset.clicked=1">Hidden</button><div role="button" onclick="this.dataset.clicked=1">Continue</div>');
    assert.equal((await page.evaluate(submitVisibleFormFallback)).method, 'button_click');
    assert.equal(await page.locator('button').getAttribute('data-clicked'), null);
    assert.equal(await page.locator('[role="button"]').getAttribute('data-clicked'), '1');
  });

  await t.test('bước mới không có form vẫn tiếp tục khi DOM giữ form cũ đã ẩn', async () => {
    await page.setContent('<form hidden><input value="old"><button>Submit</button></form><div role="button" onclick="this.dataset.clicked=1">Continue</div>');
    assert.equal((await page.evaluate(submitVisibleFormFallback)).method, 'button_click');
    assert.equal(await page.locator('[role="button"]').getAttribute('data-clicked'), '1');
  });

  for (const change of ['button.closest("form").hidden = true', 'button.disabled = true', 'button.setAttribute("aria-busy", "true")']) {
    await t.test(`nút đổi trạng thái trong lúc chờ: ${change}`, async () => {
      await page.setContent(`<form onsubmit="event.preventDefault(); this.dataset.submitted='true'"><input value="done"><button>Submit</button></form>
        <script>{ const button = document.querySelector('button');
        const observer = new MutationObserver(() => { observer.disconnect(); ${change}; });
        observer.observe(button, { attributes: true, attributeFilter: ['data-ux-last-submit-time'] }); }</script>`);
      const session = await scanCompletedForm(page);
      assert.equal(await page.locator('form').getAttribute('data-submitted'), null);
      assert.equal(session.autofillActions, undefined);
    });
  }
});
