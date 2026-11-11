/**
 * Kiểm tra xem URL có phải là trang thông báo lỗi trùng IP / đã click offer của toffers.top hay không.
 * Ví dụ: https://toffers.top/error.php?error=ip_74.124.177.158_clicked_offer_2672
 *
 * @param {string} url Địa chỉ trang cần kiểm tra.
 * @return {boolean} True nếu là trang lỗi đã click offer.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function isToffersDuplicateOfferUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /toffers\.top\/error\.php/i.test(url) || /error\.php\?.*error=.*ip_/i.test(url) || /error\.php\?error=ip_/i.test(url) || /clicked_offer_/i.test(url) || /ip_[\d\.]+_clicked_offer/i.test(url);
}
