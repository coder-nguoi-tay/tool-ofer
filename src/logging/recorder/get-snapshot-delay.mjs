import { isDiagnosticEvent } from './recording-policy.mjs';

/**
 * Gộp snapshot thường tối thiểu năm giây cùng URL; lỗi mới hoặc điều hướng chụp sớm sau 650ms.
 * @param {object} page Tab đang đợi chụp.
 * @param {object} state Các mốc chờ và snapshot trước của tab.
 * @param {number} now Mốc tính lịch chụp.
 * @return {number} Số mili giây đợi trước khi kiểm tra trạng thái tiếp theo.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function getSnapshotDelay(page, state, now = Date.now()) {
  if (state.entries.some(isDiagnosticEvent) || state.previousSnapshot?.snapshotUrl !== page.url()) return 650;
  return Math.max(650, 5000 - (now - (state.lastCheckedAt || 0)));
}
