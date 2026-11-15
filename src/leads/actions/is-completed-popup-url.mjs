import { isFinancialhelpPathThankyouUrl } from './is-financialhelp-path-thankyou-url.mjs';

/**
 * Popup là trang hoàn tất (thankyou/thanks) cần đóng ngay. paththankyou.php của FinancialHelpFinder KHÔNG tính:
 * đó là trang trung gian còn nút chuyển tiếp phải bấm (regex cũ khớp nhầm vì "paththankyou.php" chứa "thankyou.php").
 *
 * @param {*} url URL của popup.
 * @return {boolean} True nếu nên đóng popup như trang hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export function isCompletedPopupUrl(url) {
  if (!url || typeof url !== 'string' || isFinancialhelpPathThankyouUrl(url)) return false;
  return /thank[-_]?you(\.php|\.html|\/|\?|$)|thanks(\.php|\.html|\/|\?|$)/i.test(url);
}
