import { attachBrowserMousePointer } from './attach-browser-mouse-pointer.mjs';

/**
 * Gắn slot phiên vào tab để nhận diện nguồn thao tác; từng tab giữ chuột mô phỏng độc lập.
 * @param {object} page Tab Playwright thuộc phiên autofill.
 * @param {object} session Phiên có slot bắt đầu từ 1 hoặc tileIndex bắt đầu từ 0.
 * @return {void} Lưu slot khi phiên đã có định danh màn hình.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function configurePageMousePolicy(page, session) {
  if (session?.slot != null) page._autofillMouseSlot = Number(session.slot);
  else if (session?.tileIndex != null) page._autofillMouseSlot = Number(session.tileIndex) + 1;
  attachBrowserMousePointer(page);
}
