import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NEXT_BUTTON_PATTERNS,
  MULTI_CHOICE_INDICATORS,
  NONE_OF_THE_ABOVE_PATTERNS,
  NOISE_PATTERNS,
  solveRatingQuestions,
  solveMatrixQuestions,
  solveSurveyCheckboxes,
  clickSurveyNextButton,
  solveSurveyStep,
} from './survey-solver.mjs';

test('NEXT_BUTTON_PATTERNS correctly matches standard survey forward navigation buttons', () => {
  const positiveLabels = [
    'Next',
    'NEXT',
    'Next Step',
    'Next Question',
    'Continue',
    'Tiếp tục',
    'Tiếp theo',
    'Submit',
    'Submit Survey',
    'Proceed',
  ];

  for (const label of positiveLabels) {
    const isMatch = NEXT_BUTTON_PATTERNS.some((p) => p.test(label));
    assert.ok(isMatch, `Should match forward navigation label: "${label}"`);
  }

  const negativeLabels = [
    'Previous',
    'Back',
    'Quay lại',
    'Cancel',
    'Hủy',
  ];

  for (const label of negativeLabels) {
    const isMatch = NEXT_BUTTON_PATTERNS.some((p) => p.test(label));
    assert.ok(!isMatch, `Should NOT match backward or cancel label: "${label}"`);
  }
});

test('MULTI_CHOICE_INDICATORS identifies multiple-choice survey instructions', () => {
  assert.ok(MULTI_CHOICE_INDICATORS.some((p) => p.test('Please select all that apply')));
  assert.ok(MULTI_CHOICE_INDICATORS.some((p) => p.test('Choose all that apply from the list below')));
  assert.ok(MULTI_CHOICE_INDICATORS.some((p) => p.test('Hãy chọn tất cả các lựa chọn phù hợp')));
  assert.ok(!MULTI_CHOICE_INDICATORS.some((p) => p.test('Please select your gender (Male/Female)')));
});

test('NONE_OF_THE_ABOVE_PATTERNS recognizes non-applicable choices in surveys', () => {
  assert.ok(NONE_OF_THE_ABOVE_PATTERNS.some((p) => p.test('None')));
  assert.ok(NONE_OF_THE_ABOVE_PATTERNS.some((p) => p.test('None of the above')));
  assert.ok(NONE_OF_THE_ABOVE_PATTERNS.some((p) => p.test('Không có')));
  assert.ok(NONE_OF_THE_ABOVE_PATTERNS.some((p) => p.test('Not applicable')));
  assert.ok(!NONE_OF_THE_ABOVE_PATTERNS.some((p) => p.test('Netflix')));
});

test('solveSurveyStep returns structured status when given mock frame', async () => {
  // Mock Playwright frame
  const mockFrame = {
    url: () => 'https://survey.example.com/step-1',
    evaluate: async () => [],
    locator: () => ({
      count: async () => 0,
      first: () => ({ count: async () => 0 }),
    }),
  };

  const res = await solveSurveyStep(mockFrame, {}, { timeoutMs: 100 });
  assert.equal(typeof res.answeredCount, 'number');
  assert.equal(typeof res.autoAdvanced, 'boolean');
  assert.equal(typeof res.nextClicked, 'boolean');
  assert.equal(res.answeredCount, 0);
  assert.equal(res.autoAdvanced, false);
  assert.equal(res.nextClicked, false);
});

test('clickSurveyNextButton returns false if no forward button exists', async () => {
  const mockFrame = {
    evaluate: async () => null,
    locator: () => ({
      count: async () => 0,
    }),
  };

  const clicked = await clickSurveyNextButton(mockFrame, { timeoutMs: 50 });
  assert.equal(clicked, false);
});

test('solveRatingQuestions returns 0 when no rating scales on frame', async () => {
  const mockFrame = {
    evaluate: async () => [],
    locator: () => ({ count: async () => 0 }),
  };

  const count = await solveRatingQuestions(mockFrame);
  assert.equal(count, 0);
});

test('solveMatrixQuestions returns 0 when no matrix rows on frame', async () => {
  const mockFrame = {
    evaluate: async () => [],
    locator: () => ({ count: async () => 0 }),
  };

  const count = await solveMatrixQuestions(mockFrame);
  assert.equal(count, 0);
});

test('solveSurveyCheckboxes returns 0 when no checkboxes on frame', async () => {
  const mockFrame = {
    evaluate: async () => [],
    locator: () => ({ count: async () => 0 }),
  };

  const count = await solveSurveyCheckboxes(mockFrame);
  assert.equal(count, 0);
});

test('NOISE_PATTERNS correctly matches legal, footer, and nav noise labels while keeping answers intact', () => {
  const noiseLabels = [
    'Privacy Policy',
    'Terms of Service',
    'Terms & Conditions',
    'Do Not Sell My Personal Information',
    'Cookie Policy',
    'All Rights Reserved',
    'Opt-Out',
    'Unsubscribe',
    'Sign In',
    'Login',
    'Contact Us',
    'About Us',
    'Help & FAQ',
  ];

  for (const label of noiseLabels) {
    const isMatch = NOISE_PATTERNS.some((p) => p.test(label));
    assert.ok(isMatch, `Should recognize as noise: "${label}"`);
  }

  const validAnswerLabels = [
    'Yes',
    'No',
    'Male',
    'Female',
    '18-24',
    '25-34',
    'Homeowner',
    'Employed',
    'Next Step',
    'Continue',
    'Claim Reward',
  ];

  for (const label of validAnswerLabels) {
    const isMatch = NOISE_PATTERNS.some((p) => p.test(label));
    assert.ok(!isMatch, `Should NOT match valid answer/CTA: "${label}"`);
  }
});

