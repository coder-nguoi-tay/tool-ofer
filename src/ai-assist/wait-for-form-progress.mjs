import { AI_PROGRESS_CHECK_INTERVAL_MS } from './state/ai-progress-check-interval-ms.mjs';
import { getFormProgressSignature } from './get-form-progress-signature.mjs';

/**
 * Chờ tối đa một khoảng ngắn để xác định trạng thái form có thay đổi sau thao tác hay không.
 *
 * @param {object} page Trang Playwright cần chờ.
 * @param {string} previousSignature Trạng thái form trước thao tác.
 * @param {number} [timeoutMs=AI_PROGRESS_CHECK_INTERVAL_MS] Thời gian tối đa chờ thay đổi.
 * @return {Promise<boolean>} True nếu form thay đổi trong thời gian chờ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function waitForFormProgress(page, previousSignature, timeoutMs = AI_PROGRESS_CHECK_INTERVAL_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !(typeof page.isClosed === 'function' && page.isClosed())) {
    const currentSignature = await getFormProgressSignature(page);
    if (currentSignature && currentSignature !== previousSignature) return true;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}
export { waitForFormProgress };
