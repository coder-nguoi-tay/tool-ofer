import { applicationState } from '../application-state.mjs';

/**
 * Xếp một thao tác vào hàng đợi chung để tránh ghi đè trạng thái profile.
 *
 * @param {Function} handler Thao tác cần chạy.
 * @param {string} requestBody Nội dung yêu cầu truyền cho thao tác.
 * @return {Promise<object>} Kết quả thao tác.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function enqueueExclusively(handler, requestBody = '') {
  const result = applicationState.exclusiveQueue.then(() => handler(requestBody));
  applicationState.exclusiveQueue = result.catch(() => {});
  return result;
}
