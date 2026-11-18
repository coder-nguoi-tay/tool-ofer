import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForInputPacing } from '../src/autofill/interaction/wait-for-input-pacing.mjs';
import { performSurveyAnswer } from '../src/survey-solver/verification/perform-survey-answer.mjs';

test('waitForInputPacing chạy 160ms khi không cấu hình choiceDelay', async () => {
  const page = { mouse: {}, _autofillSession: {} };
  const start = Date.now();
  await waitForInputPacing(page);
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 140 && elapsed < 350, `Thời gian ${elapsed}ms nằm trong khoảng 160ms`);
});

test('waitForInputPacing luôn giữ 160ms để nhập form nhanh, không bị ảnh hưởng bởi choiceDelay của câu hỏi', async () => {
  const page = { mouse: {}, _autofillSession: { choiceDelay: 2.0 } };
  const start = Date.now();
  await waitForInputPacing(page);
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 140 && elapsed < 350, `Thời gian ${elapsed}ms giữ đúng nhịp 160ms, không bị delay theo choiceDelay 2s`);
});

test('performSurveyAnswer áp dụng choiceDelay trước khi dispatch câu trả lời', async () => {
  let clickedAt = 0;
  let evaluateCallCount = 0;
  const startTime = Date.now();

  const mockLocator = {
    count: async () => 1,
    evaluate: async () => {
      evaluateCallCount++;
      // call 1: inspectSelectionState -> false (not yet selected)
      // call 2: canAttempt -> true (can attempt)
      // call 3: verification -> true (selected)
      return evaluateCallCount >= 2;
    },
    click: async () => {
      clickedAt = Date.now();
      return true;
    }
  };

  const mockPage = {
    _autofillSession: { choiceDelay: 0.4 }, // 400ms
    mouse: null
  };

  const mockFrame = {
    page: () => mockPage,
    evaluate: async () => ({
      completed: false,
      hasControls: true
    }),
    locator: () => mockLocator
  };

  await performSurveyAnswer(mockFrame, mockLocator, {
    verificationTimeoutMs: 100
  });

  const elapsedBeforeClick = clickedAt > 0 ? clickedAt - startTime : Date.now() - startTime;
  assert.ok(elapsedBeforeClick >= 250, `Trước khi click đã chờ delay ${elapsedBeforeClick}ms`);
});
