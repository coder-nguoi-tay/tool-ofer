/**
 * Giới hạn tab riêng của offer 2615 (người dùng chốt 2026-11-17): một trình duyệt 2615 mở tối đa 2 tab, tức tab chính
 * và một offer con mỗi lúc; offer con xong (tab đóng) thì mới mở offer tiếp. Giải chung vẫn dùng MAX_OFFER_TABS = 10 và
 * MAX_CONCURRENT_SUB_OFFERS = 3. Tab trùng link do attachUniqueOfferTabs đóng (áp cho mọi phiên, kể cả 2615).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
export const OFFER_2615_MAX_TABS = 2;
export const OFFER_2615_MAX_SUB_TABS = OFFER_2615_MAX_TABS - 1;
