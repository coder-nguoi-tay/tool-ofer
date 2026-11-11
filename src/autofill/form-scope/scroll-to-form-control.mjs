/**
 * Đưa đúng control vào vùng nhìn thấy khi cần, kể cả iframe và vùng cuộn lồng nhau.
 * Playwright giữ nguyên vị trí nếu control đã thấy đầy đủ, không tự cuộn tới widget khác.
 * @param {object} control Locator hoặc ElementHandle của trường/nút cần thao tác.
 * @return {Promise<void>} Hoàn tất một lần cuộn khi control đang bị khuất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function scrollToFormControl(control) {
  if (typeof control.scrollIntoViewIfNeeded === 'function') await control.scrollIntoViewIfNeeded({ timeout: 600 }).catch(() => {});
}
