import { getHandledSurveySignatures } from './get-handled-survey-signatures.mjs';

/**
 * Kiểm tra một câu hỏi đã được click thành công trước đó hay chưa (không ghi nhận mới).
 *
 * @param {object} frame Frame Playwright chứa câu hỏi.
 * @param {string} signature Mã ổn định của câu hỏi và các lựa chọn.
 * @return {boolean} True nếu câu hỏi đã được xử lý trước đó.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function isSurveyAnswerHandled(frame, signature) {
  return getHandledSurveySignatures(frame).has(signature);
}
export { isSurveyAnswerHandled };
