import { poll } from './poll.mjs';
import { post } from './post.mjs';

/**
 * Giải captcha hình ảnh qua 2captcha.
 * @param {string} base64Image ảnh captcha dưới dạng base64
 * @param {string} apiKey API key 2captcha
 * @returns {Promise<string>} văn bản đọc được từ ảnh
 * @throws {Error} Khi dữ liệu không hợp lệ hoặc thao tác không thể hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function solveImageCaptcha(base64Image, apiKey) {
  const qs = `key=${apiKey}&method=base64&body=${encodeURIComponent(base64Image)}`;
  const response = await post('2captcha.com', '/in.php', qs);
  if (!response.startsWith('OK|')) throw new Error(`2captcha submit lỗi: ${response}`);
  return poll(response.slice(3).trim(), apiKey);
}
export { solveImageCaptcha };
