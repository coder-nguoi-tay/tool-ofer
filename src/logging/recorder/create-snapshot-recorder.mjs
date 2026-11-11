import { captureBrowserSnapshot } from './capture-browser-snapshot.mjs';
import { queueSaveBrowserLogs } from '../browser-logs/queue-save-browser-logs.mjs';
import { reserveEvidenceCapture } from './reserve-evidence-capture.mjs';
import { isDiagnosticEvent } from './recording-policy.mjs';

/**
 * Gộp mốc nghiệp vụ và chụp tối đa hai tab toàn app; lỗi mới giữ ưu tiên trong nhóm bằng chứng.
 * @param {object} session Phiên trình duyệt đang ghi nhận.
 * @return {object} Hàm schedule và stop để quản lý bộ chụp.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function createSnapshotRecorder(session) {
  const pages = new Map();
  let stopped = false;
  /**
   * Chụp nhóm thao tác đang chờ; sự kiện đến trong lúc chụp được gộp cho lượt kế tiếp.
   * @param {object} page Tab cần chụp.
   * @param {object} state Hàng đợi và trạng thái chụp của tab.
   * @return {Promise<void>} Hoàn tất lưu bằng chứng hoặc ghi lý do không chụp được.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  async function capturePending(page, state) {
    state.timer = null;
    if (stopped || page.isClosed()) { pages.delete(page); return; }
    const release = reserveEvidenceCapture();
    if (!release) {
      state.timer = setTimeout(() => void capturePending(page, state), 1000);
      state.timer.unref?.();
      return;
    }
    state.busy = true;
    const entries = state.entries.splice(0);
    try {
      const evidenceEvent = entries.find(isDiagnosticEvent) || entries.at(-1);
      const snapshot = await captureBrowserSnapshot(page, session, evidenceEvent.type, state.previousSnapshot);
      if (snapshot) {
        state.previousSnapshot = snapshot;
        Object.assign(evidenceEvent, snapshot);
        for (const entry of entries) if (entry !== evidenceEvent) entry.snapshotEventId = evidenceEvent.id;
      }
    } catch (error) { for (const entry of entries) entry.snapshotError = error.message; }
    finally {
      release();
      state.busy = false;
      queueSaveBrowserLogs();
      if (!stopped && state.entries.length) {
        state.timer = setTimeout(() => void capturePending(page, state), 650);
        state.timer.unref?.();
      } else if (stopped || page.isClosed()) pages.delete(page);
    }
  }
  /**
   * Lên lịch một ảnh cho nhóm sự kiện cùng tab trong khoảng 650 ms.
   * @param {object} page Tab nguồn của sự kiện.
   * @param {object} entry Sự kiện sẽ nhận đường dẫn ảnh và HTML.
   * @return {void} Xếp sự kiện vào nhóm đang chờ chụp.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  function schedule(page, entry) {
    if (stopped || !page || page.isClosed()) return;
    let state = pages.get(page);
    if (!state) {
      state = { entries: [], busy: false, timer: null };
      pages.set(page, state);
      page.once?.('close', () => { clearTimeout(state.timer); pages.delete(page); });
    }
    state.entries.push(entry);
    if (state.entries.length > 100) {
      const discard = state.entries.findIndex(candidate => !isDiagnosticEvent(candidate));
      const removed = state.entries.splice(discard >= 0 ? discard : 0, 1)[0];
      removed.snapshotError = 'Đã gộp quá 100 mốc chờ chụp; ưu tiên bằng chứng mới nhất.';
    }
    if (!state.busy && !state.timer) {
      state.timer = setTimeout(() => void capturePending(page, state), 650);
      state.timer.unref?.();
    }
  }
  /**
   * Dừng lịch chụp khi context đóng, giữ nguyên bằng chứng đã ghi.
   * @return {void} Hủy các timer và giải phóng tab đang chờ.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-10
   */
  function stop() {
    stopped = true;
    for (const state of pages.values()) clearTimeout(state.timer);
    pages.clear();
  }
  return { schedule, stop };
}
