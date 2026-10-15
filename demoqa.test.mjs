import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import {
  detectQaChallenge,
  fillDemoQaPracticeForm,
  parseQaPlan,
  validateDemoQaProfileCount,
} from './app.mjs';

const demoQaOrigin = 'https://demoqa.com';
const demoQaPath = '/automation-practice-form';
const demoQaUrl = demoQaOrigin + demoQaPath;
const demoQaFixtureHtml = `<!doctype html>
<html lang="en"><body>
  <h1>Student Registration Form</h1>
  <form id="practice-form">
    <label for="firstName">First Name</label><input id="firstName">
    <label for="lastName">Last Name</label><input id="lastName">
    <label for="userEmail">Email</label><input id="userEmail">
    <label for="gender-radio-1" data-test-action="gender">Male</label>
    <input id="gender-radio-1" name="gender" type="radio" value="Male">
    <label for="userNumber">Mobile</label><input id="userNumber">
    <label for="dateOfBirthInput">Date of Birth</label><input id="dateOfBirthInput" readonly>
    <select class="react-datepicker__month-select"><option value="0">January</option></select>
    <select class="react-datepicker__year-select"><option value="1995">1995</option></select>
    <button id="date-day" class="react-datepicker__day--015" type="button" data-test-action="date">15</button>
    <label for="subjectsInput">Subjects</label><input id="subjectsInput">
    <div id="maths-option" data-test-action="subject">Maths</div>
    <label for="hobbies-checkbox-1">Sports</label>
    <input id="hobbies-checkbox-1" type="checkbox" value="Sports">
    <label for="currentAddress">Current Address</label><textarea id="currentAddress"></textarea>
    <button id="state" type="button">State</button>
    <div id="ncr-option" data-test-action="state">NCR</div>
    <button id="city" type="button">City</button>
    <div id="delhi-option" data-test-action="city">Delhi</div>
    <button id="submit-button" type="button" data-test-action="submit">Submit</button>
  </form>
  <p id="confirmation" hidden>Thanks for submitting the form</p>
  <script>
    /**
     * Records fixture choices and displays the simulated submit confirmation.
     * @param {MouseEvent} event Click within the test form.
     * @return {void} No value is returned.
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-10-10
     */
    function recordFixtureClick(event) {
      const choice = event.target.closest('[data-test-action]');
      if (!choice) return;
      document.body.setAttribute('data-' + choice.dataset.testAction, 'selected');
      if (choice.dataset.testAction === 'date') {
        const month = document.querySelector('.react-datepicker__month-select').value;
        const year = document.querySelector('.react-datepicker__year-select').value;
        document.querySelector('#dateOfBirthInput').value = '15 ' + month + ' ' + year;
      }
      if (choice.dataset.testAction === 'submit') {
        document.querySelector('#confirmation').hidden = false;
      }
    }
    document.addEventListener('click', recordFixtureClick);
  </script>
</body></html>`;

let browser;

/**
 * Starts Chromium for local, network-isolated browser tests.
 * @return {Promise<void>} Resolves when the browser is ready.
 * @throws {Error} When the Playwright Chromium executable cannot start.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-10
 */
async function startTestBrowser() {
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const options = { headless: true };
  try {
    const { existsSync } = await import('node:fs');
    if (existsSync(chromePath)) options.executablePath = chromePath;
  } catch {}
  browser = await chromium.launch(options);
}

/**
 * Closes Chromium after the QA form test cases finish.
 * @return {Promise<void>} Resolves after Chromium exits.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-10
 */
async function closeTestBrowser() {
  await browser?.close();
}

/**
 * Serves only the local form fixture for every intercepted URL.
 * @param {import('playwright').Route} route Request intercepted by the test context.
 * @return {Promise<void>} Resolves after the fixture response is sent.
 * @throws {Error} When Playwright cannot fulfill the intercepted request.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-10
 */
async function serveDemoQaFixture(route) {
  await route.fulfill({ status: 200, contentType: 'text/html', body: demoQaFixtureHtml });
}

/**
 * Opens a mock page while routing all requests to the local fixture.
 * @param {string} url Browser URL used to exercise the origin guard.
 * @return {Promise<import('playwright').Page>} The fixture page.
 * @throws {Error} When the fixture page cannot load.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-10
 */
async function openMockPage(url) {
  const context = await browser.newContext();
  await context.route('**/*', serveDemoQaFixture);
  const page = await context.newPage();
  page.setDefaultTimeout(3000);
  await page.goto(url);
  return page;
}

/**
 * Builds a parser request for a one-step DemoQA practice form plan.
 * @param {string} origin Origin claimed by the plan.
 * @param {string} urlIncludes Path used to recognize the form screen.
 * @return {string} Serialized request body expected by parseQaPlan.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-10
 */
function createDemoQaPlanRequest(origin, urlIncludes) {
  return JSON.stringify({
    confirmedOrigin: origin,
    planText: JSON.stringify({
      origin,
      steps: [{
        name: 'Student Registration Form',
        when: { urlIncludes },
        actions: [{ type: 'demoqaPracticeForm' }],
      }],
    }),
  });
}

before(startTestBrowser);
after(closeTestBrowser);

/**
 * Confirms both the DemoQA preset and the real-browser QA controls are present in the UI.
 * @return {Promise<void>} Resolves when the preset fields match their expected values.
 * @throws {AssertionError} When the DemoQA preset controls or plan are missing.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-14
 */
async function demoQaPresetCase() {
  const page = await browser.newPage();
  await page.goto(new URL('./index.html', import.meta.url).href);
  await page.locator('#qa-advanced summary').click();
  await page.locator('#demoqa-preset-button').click();

  assert.equal(await page.locator('[name="websiteUrl"]').inputValue(), demoQaUrl);
  assert.equal(await page.locator('[name="requestedCount"]').inputValue(), '1');
  assert.equal(await page.locator('#auto-run-qa').isChecked(), true);
  assert.equal(await page.locator('#tab-browsers').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#qa-advanced').getAttribute('open'), '');

  const plan = JSON.parse(await page.locator('#qa-plan').inputValue());
  assert.equal(plan.origin, demoQaOrigin);
  assert.equal(plan.steps[0].when.urlIncludes, demoQaPath);
  assert.deepEqual(plan.steps[0].actions, [{ type: 'demoqaPracticeForm' }]);

}

test('UI preset loads DemoQA plan for one profile', demoQaPresetCase);

/**
 * Confirms the form helper fills synthetic data and reaches the local submit confirmation.
 * @return {Promise<void>} Resolves when all expected form interactions are observed.
 * @throws {AssertionError} When an expected field, selection or confirmation is missing.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-10
 */
async function demoQaFormSubmissionCase() {
  const page = await openMockPage(demoQaUrl);
  const result = await fillDemoQaPracticeForm(page);

  assert.deepEqual(result, { fieldsFilled: 9, questionsAnswered: 2 });
  assert.equal(await page.locator('#firstName').inputValue(), 'QA');
  assert.equal(await page.locator('#lastName').inputValue(), 'Demo');
  assert.equal(await page.locator('#userEmail').inputValue(), 'demoqa.qa@example.test');
  assert.equal(await page.locator('#gender-radio-1').isChecked(), true);
  assert.equal(await page.locator('#userNumber').inputValue(), '5550000142');
  assert.equal(await page.locator('#dateOfBirthInput').inputValue(), '15 0 1995');
  assert.equal(await page.locator('#subjectsInput').inputValue(), 'Maths');
  assert.equal(await page.locator('#hobbies-checkbox-1').isChecked(), true);
  assert.equal(await page.locator('#currentAddress').inputValue(), '123 Example Street');
  for (const action of ['gender', 'date', 'subject', 'state', 'city', 'submit']) {
    assert.equal(await page.locator('body').getAttribute('data-' + action), 'selected', action + ' action missing');
  }
  assert.equal(await page.getByText('Thanks for submitting the form', { exact: true }).isVisible(), true);
}

test('DemoQA preset fills the form and confirms submission on a local fixture', demoQaFormSubmissionCase);

/**
 * Confirms the form helper refuses a different host or a different page path.
 * @return {Promise<void>} Resolves when both out-of-scope pages are rejected.
 * @throws {AssertionError} When an out-of-scope page is not blocked.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-10
 */
async function demoQaOriginGuardCase() {
  for (const url of ['https://example.test' + demoQaPath, demoQaOrigin + '/other-page']) {
    const page = await openMockPage(url);
    let failure;
    try {
      await fillDemoQaPracticeForm(page);
    } catch (error) {
      failure = error;
    }
    assert.match(failure?.message ?? '', /chỉ chạy tại https:\/\/demoqa\.com\/automation-practice-form/);
  }
}

test('DemoQA form helper blocks any other origin or path', demoQaOriginGuardCase);

/**
 * Checks that DemoQA action plans are scoped correctly and limited to one profile.
 * @return {Promise<void>} Resolves when valid and invalid plans are distinguished.
 * @throws {AssertionError} When the parser or profile-count guard accepts an invalid case.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-10
 */
async function demoQaPlanScopeCase() {
  const plan = parseQaPlan(createDemoQaPlanRequest(demoQaOrigin, demoQaPath));
  validateDemoQaProfileCount(plan, 1);

  for (const profileCount of [0, 2]) {
    let failure;
    try {
      validateDemoQaProfileCount(plan, profileCount);
    } catch (error) {
      failure = error;
    }
    assert.match(failure?.message ?? '', /chỉ chạy một profile/);
  }

  for (const [origin, path] of [
    ['https://example.test', demoQaPath],
    [demoQaOrigin, '/other-page'],
  ]) {
    let failure;
    try {
      parseQaPlan(createDemoQaPlanRequest(origin, path));
    } catch (error) {
      failure = error;
    }
    assert.match(failure?.message ?? '', /chỉ chạy trên trang form DemoQA/);
  }
}

test('DemoQA plan enforces the target page and a single profile before launch', demoQaPlanScopeCase);

/**
 * Confirms an OTP challenge is detected so a QA run can stop safely.
 * @return {Promise<void>} Resolves when the detector recognizes OTP and human-verification text.
 * @throws {AssertionError} When either challenge form is not detected.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-10
 */
async function qaChallengeStopCase() {
  const page = await browser.newPage();
  await page.setContent('<input name="otp" autocomplete="one-time-code">');
  assert.equal(await detectQaChallenge(page), 'Phát hiện CAPTCHA hoặc trường OTP');

  await page.setContent('<p>Verify you are human</p>');
  assert.equal(await detectQaChallenge(page), 'Phát hiện nội dung xác minh người dùng hoặc OTP');
}

test('QA challenge detector stops on OTP or human verification', qaChallengeStopCase);
