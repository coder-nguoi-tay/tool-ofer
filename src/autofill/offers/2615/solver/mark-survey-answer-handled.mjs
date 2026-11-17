// Bản giải riêng của offer 2615, chép từ src/autofill/mark-survey-answer-handled.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
import { getHandledSurveySignatures } from './get-handled-survey-signatures.mjs';

/**
 * GHI NHẬN một câu hỏi đã được click THÀNH CÔNG để vòng quét sau không click lại.
 * Chỉ gọi sau khi click thật sự thành công — nếu gọi trước, click hỏng sẽ khiến
 * câu hỏi bị "đánh dấu xử lý" vĩnh viễn và không bao giờ được thử lại.
 *
 * @param {object} frame Frame Playwright chứa câu hỏi.
 * @param {string} signature Mã ổn định của câu hỏi và các lựa chọn.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function markSurveyAnswerHandled(frame, signature) {
  const handledSignatures = getHandledSurveySignatures(frame);
  handledSignatures.add(signature);
  if (handledSignatures.size > 500) handledSignatures.delete(handledSignatures.values().next().value);
}
export { markSurveyAnswerHandled };
