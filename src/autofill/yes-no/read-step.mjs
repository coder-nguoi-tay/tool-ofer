import { inspectYesNoStep } from '../inspect-yes-no-step.mjs';
import { inspectSurveySubform } from './inspect-survey-subform.mjs';

/**
 * Đọc nhóm đáp án và subform cùng phạm vi; lỗi đọc giữ bước thay vì click bằng dữ liệu thiếu.
 * @param {object} frame Frame sở hữu câu hỏi.
 * @param {object|null} scope Phạm vi form đã chọn.
 * @return {Promise<object|null>} Snapshot kết hợp hoặc null khi không đọc được DOM.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function readYesNoStep(frame, scope) {
  try {
    const questions = await frame.evaluate(inspectYesNoStep, scope);
    if (!questions) return null;
    const subform = await frame.evaluate(inspectSurveySubform, scope);
    if (!subform) return null;
    return { ...questions, ...subform };
  } catch { return null; }
}
