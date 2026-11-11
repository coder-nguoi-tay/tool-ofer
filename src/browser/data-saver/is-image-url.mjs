/**
 * Kiểm tra xem URL có phải là hình ảnh không.
 * Cần giữ lại 100% hình ảnh (trắc nghiệm bằng hình ảnh, logo, ảnh captcha, ảnh minh họa).
 *
 * @param {string} url
 * @return {boolean} True nếu URL thuộc nhóm tài nguyên tương ứng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function isImageUrl(url) {
  if (!url) return false;
  return /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)($|\?)/i.test(url);
}
export { isImageUrl };
