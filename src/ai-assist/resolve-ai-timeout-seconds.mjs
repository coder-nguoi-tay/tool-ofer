import { AI_REQUEST_TIMEOUT_SECONDS } from './state/ai-request-timeout-seconds.mjs';

/**
 * Tôn trọng thời gian chờ AI đã cấu hình, giới hạn để tránh tiến trình treo vô hạn.
 *
 * @param {number|string} configuredSeconds Số giây người dùng cấu hình.
 * @return {number} Thời gian chờ từ 1 đến 300 giây.
 * @throws {never} Giá trị không hợp lệ được thay bằng mặc định.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function resolveAiTimeoutSeconds(configuredSeconds) {
  const seconds = Number(configuredSeconds);
  return Math.max(1, Math.min(seconds > 0 ? seconds : AI_REQUEST_TIMEOUT_SECONDS, 300));
}
export { resolveAiTimeoutSeconds };
