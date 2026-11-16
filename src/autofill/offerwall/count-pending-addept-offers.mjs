import { isAddeptOfferwallFrame } from './is-addept-offerwall-frame.mjs';

/**
 * Đếm offer Addept còn chưa bấm trên mọi iframe offerwall của tab (chỉ đọc, không đổi DOM): thẻ .unit-card đang hiện
 * chưa có data-ux-ow-clicked, cộng 1 nếu khung #infoPanel còn mở. Dùng để không đóng phiên khi trang cuối còn offer.
 *
 * @param {object} page Tab cần kiểm.
 * @return {Promise<number>} Số offer chưa bấm; không đọc được frame nào thì coi như 1 (chưa xong, an toàn hơn).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
export async function countPendingAddeptOffers(page) {
  let total = 0;
  for (const frame of (typeof page?.frames === 'function' ? page.frames() : []).filter(isAddeptOfferwallFrame)) {
    const count = await Promise.race([
      frame.evaluate(() => {
        const visible = element => {
          for (let node = element; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (node.hidden || style.display === 'none' || style.visibility === 'hidden') return false;
          }
          return element.getClientRects().length > 0;
        };
        const cards = Array.from(document.querySelectorAll('.unit-stack .unit-card')).filter(card => visible(card) && card.getAttribute('data-ux-ow-clicked') !== '1');
        const panel = document.getElementById('infoPanel');
        return cards.length + (panel && visible(panel) ? 1 : 0);
      }),
      new Promise(resolve => setTimeout(() => resolve(null), 3000)),
    ]).catch(() => null);
    total += count ?? 1;
  }
  return total;
}
