/**
 * Lỗi CDP/Playwright do tab, context hoặc browser đã đóng giữa chừng — va chạm vô hại, không cần cảnh báo.
 *
 * @param {Error|null|undefined} error Lỗi bắt được.
 * @param {{isClosed?: () => boolean}} [page] Tab liên quan (nếu có).
 * @return {boolean} True nếu lỗi chỉ do mục tiêu đã đóng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function isClosedTargetError(error, page) {
  if (!error) return false;
  if (page?.isClosed?.()) return true;
  return /Target (page, context or browser has been )?closed|has been closed|Browser has been disconnected/i.test(String(error.message || error));
}
