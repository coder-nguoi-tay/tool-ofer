/**
 * Nhận diện tab phụ của phiên dựa trên tab chính và các tab gốc đã đăng ký.
 * @param {object|null} page Tab cần phân loại.
 * @param {object} [session] Phiên quản lý tab.
 * @return {boolean} Tab phụ chỉ được xử lý công việc trong iframe.
 * @throws {never} Tab chưa gắn phiên giữ cách xử lý độc lập.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export function isSecondaryOfferTab(page, session = page?._autofillSession) {
  return Boolean(page && session?.mainPage && page !== session.mainPage && !page._uxOriginTab);
}
