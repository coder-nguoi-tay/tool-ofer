/**
 * Loại bỏ thông tin nhạy cảm (API key, mật khẩu, CDP WebSocket URL) khỏi log.
 *
 * @param {string} text Chuỗi cần làm sạch.
 * @returns {string} Chuỗi an toàn để ghi log.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function redactSecrets(text) {
  if (typeof text !== 'string') return String(text ?? '');
  return text.replace(/ws:\/\/[^\s'"]+/g, 'ws://[REDACTED_CDP_ENDPOINT]').replace(/(?:Bearer\s+|api[_-]?key[:=\s]+)[A-Za-z0-9_-]{16,}/gi, 'Bearer [REDACTED_API_KEY]').replace(/(?:password[:=\s]+)[^\s&'"]+/gi, 'password=[REDACTED]');
}
export { redactSecrets };
