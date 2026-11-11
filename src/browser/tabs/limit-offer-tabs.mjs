/**
 * Giữ API tương thích sau khi tắt tự đóng tab vượt trần do bị phân loại không phải offer.
 * Trần mở offerwall vẫn được reserveOfferwallTabSlot áp dụng trước khi tạo tab.
 * @param {object} context BrowserContext của phiên.
 * @param {object} session Phiên đang chạy.
 * @param {number} maxTabs Trần cũ, không dùng để đóng tab đã mở.
 * @return {void} Không gắn listener quét DOM hoặc tự đóng tab.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function limitOfferTabs(context, session, maxTabs) {
  // Người dùng tắt chính sách đóng non-offer; giữ entry point cho các launcher hiện tại.
}
