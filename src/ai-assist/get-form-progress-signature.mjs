import { readVisiblePageState } from './visible-state/read-visible-page-state.mjs';

/**
 * Lấy chữ ký dữ liệu hiển thị; bỏ marker, bước ẩn và thay đổi nền không phải tiến triển của form.
 * @param {object} page Tab Playwright cần so sánh trước/sau thao tác.
 * @return {Promise<string>} Chữ ký ổn định hoặc chuỗi rỗng khi không đọc được giao diện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function getFormProgressSignature(page) {
  const state = await readVisiblePageState(page);
  return state.available ? state.signature : '';
}
