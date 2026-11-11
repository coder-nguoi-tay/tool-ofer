/**
 * Giữ 2.000 sự kiện mới nhất cùng sự kiện được ghi chú và bằng chứng mà chúng tham chiếu.
 * Không đánh lại sequence/id vì ghi chú và trang replay dùng các định danh đó.
 * @param {object} sessionItem Phiên trong lịch sử ghi nhận.
 * @return {void} Cắt log cũ và tăng số sự kiện đã lược bớt của phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function limitSessionEvents(sessionItem) {
  const logs = sessionItem.logs;
  if (logs.length <= 2000) return;
  const retained = new Set(logs.slice(-2000).map(entry => entry.id));
  for (const feedback of sessionItem.feedback || []) retained.add(feedback.eventId);
  const byId = new Map(logs.map(entry => [entry.id, entry]));
  for (const id of retained) {
    const reference = byId.get(id)?.snapshotEventId;
    if (reference) retained.add(reference);
  }
  const kept = logs.filter(entry => retained.has(entry.id));
  sessionItem.omittedEventCount = (sessionItem.omittedEventCount || 0) + logs.length - kept.length;
  logs.splice(0, logs.length, ...kept);
}
