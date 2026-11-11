import { activeBrowsers } from '../../browser/sessions.mjs';
import { activeExitIpLocks } from '../../runtime/constants/active-exit-ip-locks.mjs';

/**
 * Kiểm tra xem một IP exit có đang chạy đồng thời ở bất kỳ cửa sổ nào không.
 *
 * @param {string|null} exitIp Địa chỉ IP exit.
 * @return {boolean} True nếu IP đang bận.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function isExitIpCurrentlyInUse(exitIp) {
  if (!exitIp) return false;
  if (activeExitIpLocks.has(exitIp)) return true;
  for (const session of activeBrowsers) {
    if (session.exitIp === exitIp) return true;
  }
  return false;
}
