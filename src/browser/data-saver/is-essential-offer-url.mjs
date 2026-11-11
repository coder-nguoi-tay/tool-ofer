/**
 * Kiểm tra xem URL có phải là tài nguyên bảo mật / captcha / lead tracker thiết yếu không.
 *
 * @param {string} url
 * @return {boolean} True nếu URL thuộc nhóm tài nguyên tương ứng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function isEssentialOfferUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('recaptcha') || lower.includes('hcaptcha') || lower.includes('challenges.cloudflare.com') || lower.includes('turnstile') || lower.includes('arkoselabs') || lower.includes('funcaptcha') || lower.includes('geetest') || lower.includes('google.com/recaptcha') || lower.includes('gstatic.com/recaptcha') || lower.includes('/cdn-cgi/challenge-platform') || lower.includes('/cdn-cgi/trace');
}
export { isEssentialOfferUrl };
