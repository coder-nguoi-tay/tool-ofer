/**
 * Tên brand Client Hints theo kênh Chrome đã cài.
 * @param {*} channel channel.
 * @return {*} Kết quả xử lý chrome brand for channel.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function chromeBrandForChannel(channel) {
  return /testing|cft/i.test(String(channel ?? '')) ? 'Google Chrome for Testing' : 'Google Chrome';
}
export { chromeBrandForChannel };
