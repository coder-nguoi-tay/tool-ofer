import { readVisiblePageState } from './visible-state/read-visible-page-state.mjs';

/**
 * Chỉ coi là còn việc khi có control hiển thị chưa hoàn tất hoặc nút có thể thao tác.
 * @param {object} page Tab cần kiểm tra, gồm form/frame đang làm việc.
 * @return {Promise<boolean>} True khi có thao tác hợp lệ; checkbox đã chọn không giữ vòng AI chạy mãi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function pageHasWork(page) {
  if (!page || page.isClosed?.()) return false;
  const state = await readVisiblePageState(page);
  return state.available && state.hasWork;
}
