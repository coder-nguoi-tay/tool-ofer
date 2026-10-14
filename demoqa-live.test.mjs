import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { detectQaChallenge, fillDemoQaPracticeForm } from './app.mjs';

const demoQaUrl = 'https://demoqa.com/automation-practice-form';
let browser;

/**
 * Starts Chromium for the explicitly requested live DemoQA smoke test.
 * @return {Promise<void>} Resolves when Chromium is ready.
 * @throws {Error} When Playwright Chromium cannot start.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-11
 */
async function startLiveTestBrowser() {
  browser = await chromium.launch({ headless: true });
}

/**
 * Closes Chromium after the live DemoQA test completes.
 * @return {Promise<void>} Resolves after Chromium exits.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-11
 */
async function closeLiveTestBrowser() {
  await browser?.close();
}

/**
 * Opens the public practice form, refuses a challenge page, and submits synthetic QA data.
 * @return {Promise<void>} Resolves when the live demo confirms the submission.
 * @throws {Error} On navigation failure, challenge detection, selector mismatch or failed submit.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-11
 */
async function runLiveDemoQaSmokeTest() {
  const page = await browser.newPage();
  page.setDefaultTimeout(10_000);
  await page.goto(demoQaUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  assert.equal(new URL(page.url()).origin, 'https://demoqa.com');
  assert.equal(new URL(page.url()).pathname, '/automation-practice-form');

  const challenge = await detectQaChallenge(page);
  assert.equal(challenge, null, challenge ?? 'Unexpected challenge result');

  const result = await fillDemoQaPracticeForm(page);
  assert.deepEqual(result, { fieldsFilled: 9, questionsAnswered: 2 });
  assert.equal(await page.getByText('Thanks for submitting the form', { exact: true }).isVisible(), true);
}

before(startLiveTestBrowser);
after(closeLiveTestBrowser);
test('live DemoQA practice form accepts the synthetic QA fixture', { timeout: 90_000 }, runLiveDemoQaSmokeTest);
