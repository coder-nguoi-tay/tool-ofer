import { inspectQuestionState } from './inspect-question-state.mjs';

/**
 * Đọc định danh bước khảo sát; lỗi navigation/DOM là trạng thái chưa biết, không phải thành công.
 * @param {object} frame Frame sở hữu khảo sát.
 * @return {Promise<object>} Snapshot hoặc available=false khi không đọc được.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function readQuestionState(frame) {
  let timer;
  try {
    const state = await Promise.race([
      frame.evaluate(inspectQuestionState, frame._activeAutofillFormScope || null),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), 1800); timer.unref?.(); }),
    ]);
    return state?.available && typeof state.identity === 'string' ? state : { available: false };
  } catch { return { available: false }; }
  finally { clearTimeout(timer); }
}

/**
 * Phân biệt chuyển câu/chuyển trang với việc chỉ thay checked, selected hoặc dữ liệu field.
 * @param {object} before Snapshot trước thao tác.
 * @param {object} after Snapshot sau thao tác.
 * @return {boolean} Có bước mới hoặc màn hoàn tất đã xác minh.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function didQuestionAdvance(before, after) {
  if (!before.available || !after.available) return false;
  if (before.url !== after.url) return true;
  if (before.identity === after.identity || !after.hasControls && !after.completed) return false;
  const headingReplaced = (before.headings || []).some(heading => !(after.headings || []).includes(heading));
  const oldKeys = before.questionKeys || [];
  const optionsReplaced = oldKeys.length >= 2 && oldKeys.every(key => !(after.questionKeys || []).includes(key)) && after.hasQuestions;
  return headingReplaced || optionsReplaced || after.completed;
}
