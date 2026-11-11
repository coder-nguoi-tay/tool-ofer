const pageStates = new WeakMap();

/**
 * Dừng gọi AI với cùng trạng thái đã thất bại; chỉ mở lại khi giao diện đổi hoặc người dùng thử lại.
 * @param {object} page Tab sở hữu trạng thái retry riêng.
 * @param {object} state Trạng thái hiển thị hiện tại của tab.
 * @param {boolean} forceRetry Người dùng chủ động yêu cầu thử lại.
 * @return {object} allowed, reason và shouldLog cho quyết định gọi AI.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function inspectAiStateGate(page, state, forceRetry = false) {
  const previous = pageStates.get(page) || {};
  if (forceRetry || state.available && previous.blockedSignature !== state.signature) previous.blockedSignature = null;
  const reason = !state.available ? 'inspection_unavailable' : !state.hasWork ? 'no_visible_actions' : previous.blockedSignature === state.signature ? 'unchanged_after_failure' : null;
  const logKey = `${state.signature}:${reason}`;
  const shouldLog = Boolean(reason && previous.logKey !== logKey);
  previous.logKey = reason ? logKey : null;
  pageStates.set(page, previous);
  const detail = { inspection_unavailable: 'Chưa đọc được giao diện hiện tại', no_visible_actions: 'Chưa có trường cần điền hoặc nút sẵn sàng; chờ widget hiển thị bước tiếp', unchanged_after_failure: 'Giao diện chưa đổi sau các lần thử; chỉ thử lại khi trạng thái thay đổi hoặc người dùng yêu cầu' }[reason];
  return { allowed: !reason, reason, detail, shouldLog };
}

/**
 * Giữ khóa cho trạng thái không tiến triển sau khi AI đã được thử đủ số vòng.
 * @param {object} page Tab cần dừng việc gọi AI tự động.
 * @param {string} signature Chữ ký của trạng thái vừa thất bại.
 * @return {void} Ghi khóa riêng cho tab, không ảnh hưởng tab khác.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function blockAiForState(page, signature) {
  pageStates.set(page, { ...pageStates.get(page), blockedSignature: signature });
}
