import { getSurveySaveState } from './yes-no/get-save-state.mjs';
import { clickSurveySave } from './yes-no/click-save.mjs';

/**
 * Ưu tiên lưu subform Yes có Save/Cancel trước Continue, đợi Save biến mất rồi mới nhả bước.
 * @param {object} frame Frame chứa subform trong phạm vi hiện tại.
 * @param {object} page Tab để dispatch chuột thật.
 * @param {object} current Snapshot subform, gồm Save và các ô còn thiếu.
 * @param {object} options Callback log và quyền tự submit của phiên.
 * @return {Promise<object|null>} Quyết định giữ bước/điền subform, hoặc null khi không có Save.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function handleSurveySave(frame, page, current, options) {
  const state = getSurveySaveState(frame, current);
  if (!state) return null;
  if (current.needsInput) return { handled: false, actions: 0, waitingForInput: true };
  if (Date.now() < state.nextAt || options.autoSubmit === false) return { handled: true, actions: 0 };
  if (state.attempts >= 2) {
    if (!state.logged) options.onLog?.({ type: 'survey_save_waiting', detail: 'Đã bấm Save hai lần nhưng subform chưa đóng; giữ bước, chưa bấm Tiếp tục.' }, page);
    state.logged = true;
    return { handled: true, actions: 0 };
  }
  return clickSurveySave({ frame, page, selector: current.saveSelector, state, options });
}
