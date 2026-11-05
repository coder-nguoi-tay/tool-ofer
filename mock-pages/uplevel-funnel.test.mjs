import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { findSubmitButton, handleRadioAndSurveyOptions } from '../autofill.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const offlineFixturePath = fileURLToPath(new URL('./uplevel-zulily-offline.html', import.meta.url));

/**
 * Chặn mọi yêu cầu mạng ngoài để bài test chỉ chạy trên fixture local.
 *
 * @param {import('playwright').Route} route Yêu cầu mạng cần chặn.
 * @return {Promise<void>} Hoàn tất sau khi hủy yêu cầu.
 * @throws {Error} Khi Playwright không thể hủy yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24 00:00:00 +07:00
 */
async function blockExternalNetwork(route) {
  await route.abort();
}

/**
 * Lưu lại URL ngoài nếu fixture vô tình phát sinh yêu cầu mạng.
 *
 * @param {import('playwright').Request} request Yêu cầu được Chromium phát ra.
 * @return {void} Không trả về giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24 00:00:00 +07:00
 */
function recordExternalRequest(request) {
  if (/^https?:\/\//i.test(request.url())) {
    observedExternalRequests.push(request.url());
  }
}

let observedExternalRequests = [];

/**
 * Kiểm tra toàn bộ funnel Zulily đã được dựng lại trong fixture offline.
 *
 * @return {Promise<void>} Hoàn tất khi các bước câu hỏi, email và chặn mạng đều đạt.
 * @throws {Error} Khi giao diện hoặc tương tác khác với luồng đã lưu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24 00:00:00 +07:00
 */
async function verifyOfflineUplevelFunnel() {
  observedExternalRequests = [];
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1200, height: 827 } });
    await context.route(/^https?:\/\//i, blockExternalNetwork);
    const page = await context.newPage();
    page.on('request', recordExternalRequest);
    await page.goto(pathToFileURL(offlineFixturePath).href);

    assert.equal(await page.title(), 'Deals', 'fixture keeps the captured page title');
    assert.equal(await page.locator('#offline-stage-capture').getAttribute('src'), './assets/uplevel-q2.jpg', 'the captured Q2 view is shown first');
    assert.match(await page.locator('#ft-offers-container-p').innerText(), /mobile games and apps/i);

    const session = { autofillFields: 0 };
    const record = { email: 'test@example.invalid' };
    const questionStages = [
      { current: 'q2', next: 'q3' },
      { current: 'q3', next: 'loading' },
    ];

    for (const stage of questionStages) {
      const currentScreen = page.locator(`[data-screen="${stage.current}"]`);
      assert.equal(await currentScreen.isVisible(), true, `${stage.current} is the visible screen`);
      assert.equal(await currentScreen.locator('.option').count(), 2, `${stage.current} has its two captured answers`);

      const answeredCount = await handleRadioAndSurveyOptions(page, record, session);
      assert.ok(answeredCount > 0, `${stage.current} receives a local test selection`);
      assert.equal(await currentScreen.locator('.option.selected.active').count(), 1, `${stage.current} shows one selected answer`);
      await page.locator(`[data-screen="${stage.next}"]`).waitFor({ state: 'visible', timeout: 5000 });
    }

    await page.locator('[data-screen="email"]').waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await page.locator('#email').getAttribute('placeholder'), 'Enter Your Email Address');
    assert.match(await page.locator('.terms').innerText(), /email marketing/i);

    const continueButton = await findSubmitButton(page);
    assert.ok(continueButton, 'the production submit-button finder locates Continue');
    await page.locator('#email').fill(record.email);
    await continueButton.click();
    assert.equal(await page.locator('#local-submit-status').isVisible(), true, 'final action is recorded only in the local fixture');
    assert.equal(await page.locator('#local-submit-status').getAttribute('data-submitted'), 'true');
    assert.deepEqual(observedExternalRequests, [], 'the simulation makes no external network requests');

    await context.close();
  } finally {
    await browser.close();
  }
}

test('Uplevel Rewards / Zulily funnel stays inside the offline test fixture', verifyOfflineUplevelFunnel);
