/**
 * Gộp phản hồi /browser-logs vào danh sách đang hiển thị. Phản hồi đủ (không có `since`) thay toàn bộ;
 * phản hồi phần mới: nối sự kiện mới, thay sự kiện gộp cùng id, thêm phiên mới lên đầu, bỏ phiên không còn trong `ids`.
 * @param {object[]} current Danh sách phiên đang hiển thị.
 * @param {object} res Phản hồi của /browser-logs.
 * @return {{logData: object[], changed: boolean}} Danh sách mới và có thay đổi hay không.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
function mergeLogDelta(current, res) {
  if (res.since === undefined) return { logData: res.sessions, changed: true };
  const ids = new Set(res.ids || []);
  const kept = current.filter(session => ids.has(session.id));
  let changed = kept.length !== current.length || res.sessions.length > 0;
  for (const incoming of res.sessions) {
    const existing = kept.find(session => session.id === incoming.id);
    if (!existing) { kept.unshift(incoming); continue; }
    Object.assign(existing, incoming, { logs: existing.logs || [] });
    for (const entry of incoming.logs) {
      const index = existing.logs.findIndex(item => item.id === entry.id);
      if (index >= 0) existing.logs[index] = entry; else existing.logs.push(entry);
    }
  }
  return { logData: kept, changed };
}
