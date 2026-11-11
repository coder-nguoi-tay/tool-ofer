const steps = new WeakMap();

/**
 * Giữ bộ đếm theo frame/câu hỏi và chuyển sang No sau hai Continue không đổi bước.
 * @param {object} frame Frame sở hữu bộ đếm độc lập.
 * @param {object|null} current Snapshot nhóm câu hỏi; null để xóa trạng thái khi hết câu hỏi.
 * @param {object} options Callback ghi lý do đổi lựa chọn.
 * @param {object} page Tab để liên kết log.
 * @return {object|null} Trạng thái hiện tại hoặc null khi không còn câu hỏi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function getYesNoStepState(frame, current, options, page) {
  if (!current?.questions.length) { steps.delete(frame); return null; }
  const signature = JSON.stringify([current.url, current.questions.map(question => question.identity)]);
  let state = steps.get(frame);
  if (!state || state.signature !== signature) {
    state = { signature, attempts: 0, no: false, nextAt: 0, notified: false };
    steps.set(frame, state);
  }
  if (Date.now() >= state.nextAt && !state.no && state.attempts >= 2) {
    state.no = true; state.attempts = 0;
    options.onLog?.({ type: 'survey_yes_no_fallback', detail: 'Đã bấm Tiếp tục hai lần mà cùng bước chưa đổi; chuyển lựa chọn Yes sang No.' }, page);
  }
  return state;
}
