import { poll } from './poll.mjs';
import { post } from './post.mjs';

/**
 * Giải reCAPTCHA v2 qua 2captcha.
 * @param {string} siteKey data-sitekey trên trang
 * @param {string} pageUrl URL của trang đang mở
 * @param {string} apiKey API key 2captcha
 * @returns {Promise<string>} token để điền vào g-recaptcha-response
 * @throws {Error} Khi dữ liệu không hợp lệ hoặc thao tác không thể hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function solveReCaptcha(siteKey, pageUrl, apiKey) {
  const qs = `key=${apiKey}&method=userrecaptcha&googlekey=${encodeURIComponent(siteKey)}&pageurl=${encodeURIComponent(pageUrl)}`;
  const response = await post('2captcha.com', '/in.php', qs);
  if (!response.startsWith('OK|')) throw new Error(`2captcha submit lỗi: ${response}`);
  return poll(response.slice(3).trim(), apiKey);
}
export { solveReCaptcha };
