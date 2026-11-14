import { isAccessOnlyLogging } from '../is-access-only-logging.mjs';

const debugUntil = process.env.AUTOLEADPC_FULL_HTML_DEBUG === '1' ? Date.now() + 600_000 : 0;

/**
 * Chỉ cho phép ghi HTML toàn trang trong phiên debug chủ động tối đa 10 phút.
 * @return {boolean} True khi đã bật debug qua biến môi trường và chưa hết hạn.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export function isFullHtmlDebugEnabled() {
  return !isAccessOnlyLogging() && Date.now() < debugUntil;
}
