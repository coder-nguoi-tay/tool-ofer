// Bản giải riêng của offer 2615, chép từ src/autofill/get-handled-survey-signatures.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
import { handledSurveyAnswerSignatures } from './state/handled-survey-answer-signatures.mjs';

/**
 * Lấy (và khởi tạo nếu chưa có) tập signature đã xử lý của một frame.
 *
 * @param {object} frame Frame Playwright.
 * @return {Set<string>} Tập signature đã được click thành công.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getHandledSurveySignatures(frame) {
  let handledSignatures = handledSurveyAnswerSignatures.get(frame);
  if (!handledSignatures) {
    handledSignatures = new Set();
    handledSurveyAnswerSignatures.set(frame, handledSignatures);
  }
  return handledSignatures;
}
export { getHandledSurveySignatures };
