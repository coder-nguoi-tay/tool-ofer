/**
 * Số tab offer con app tự mở cùng lúc trong một trình duyệt (trang cuối: thẻ offerwall, task Addept, màn card).
 * Giảm 9 → 3 (2026-11-16): 10 trình duyệt × 9 tab con làm máy 16 GB hết RAM, nóng và đơ. Offer vẫn được mở hết,
 * chỉ lần lượt — tab con xong thì mở tiếp. Trần cứng đóng tab dư (MAX_OFFER_TABS = 10) giữ nguyên để không đóng nhầm
 * popup do chính offer mở ra.
 */
const MAX_CONCURRENT_SUB_OFFERS = 3;
export { MAX_CONCURRENT_SUB_OFFERS };
