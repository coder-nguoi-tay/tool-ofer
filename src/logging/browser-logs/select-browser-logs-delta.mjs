/**
 * Phần log mới hơn `since`: chỉ phiên có sự kiện mới (metadata phiên + các sự kiện đó), kèm id của mọi phiên
 * để client bỏ phiên đã bị dọn. Quét toàn bộ (≤ 2.000 sự kiện/phiên × vài chục phiên ≈ 1 ms) thay vì
 * quét ngược từ cuối, vì sự kiện gộp nằm ở giữa mảng cũng có thể nhận seq mới.
 *
 * @param {object[]} sessions Danh sách phiên đã lưu (mới nhất trước).
 * @param {number} since Số thứ tự cuối cùng client đã có.
 * @return {{ids: string[], sessions: object[]}} Phiên có sự kiện mới và danh sách id.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export function selectBrowserLogsDelta(sessions, since) {
  const changed = [];
  for (const session of sessions) {
    const logs = (session.logs || []).filter(entry => entry.seq > since);
    if (logs.length) changed.push({ ...session, logs });
  }
  return { ids: sessions.map(session => session.id), sessions: changed };
}
