// Bản giải riêng của offer 2615, chép từ src/autofill/yes-no/get-save-state.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
const saveAttempts = new WeakMap();

/**
 * Giữ lượt thử Save theo frame/URL/nút, xóa khi subform không còn hiển thị.
 * @param {object} frame Frame sở hữu subform.
 * @param {object} current Snapshot URL và selector Save hiện tại.
 * @return {object|null} Bộ đếm riêng của subform hoặc null khi không có Save.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function getSurveySaveState(frame, current) {
  if (!current.saveSelector) { saveAttempts.delete(frame); return null; }
  const identity = `${current.url}:${current.saveSelector}`;
  let state = saveAttempts.get(frame);
  if (!state || state.identity !== identity) {
    state = { identity, attempts: 0, nextAt: 0, logged: false };
    saveAttempts.set(frame, state);
  }
  return state;
}
