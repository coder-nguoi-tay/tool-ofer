import { isDiagnosticEvent } from './recording-policy.mjs';

/**
 * Gộp lỗi lặp 60 giây và thao tác click/change giống nhau 10 giây trên cùng tab.
 * URL có query biến động được chuẩn hóa chỉ trong khóa gộp; bản ghi gốc vẫn giữ ngữ cảnh.
 * @return {Function} Nhận sự kiện, tab, hàm tạo bản ghi; trả bản ghi và cờ isNew.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function createLogCoalescer() {
  const tabs = new WeakMap();
  const sessionEntries = new Map();
  return (entry, page, createEntry) => {
    const noisy = entry.coalesceAsFailure || isDiagnosticEvent(entry) || entry.type === 'ai_waiting_state' ||
      entry.type === 'browser_action' && ['click', 'change', 'keydown', 'input', 'scroll', 'unload'].includes(entry.kind);
    if (!noisy) return { entry: createEntry(), isNew: true };
    let entries = page ? tabs.get(page) : sessionEntries;
    if (!entries) { entries = new Map(); tabs.set(page, entries); }
    const normalize = value => String(value || '').replace(/https?:\/\/[^\s"<>]+/g, url => url.split(/[?#]/)[0]);
    const key = JSON.stringify([entry.type, entry.kind, normalize(entry.url || entry.frm), normalize(entry.detail), entry.status, entry.method, entry.resourceType, entry.el, entry.checked, entry.visible]);
    const previous = entries.get(key);
    const windowMs = isDiagnosticEvent(entry) || entry.coalesceAsFailure ? 60_000 : 10_000;
    if (previous && Date.now() - previous.startedAt < windowMs) {
      previous.entry.repeatCount = (previous.entry.repeatCount || 1) + 1;
      previous.entry.lastSeenAt = new Date().toISOString();
      return { entry: previous.entry, isNew: false };
    }
    const created = createEntry();
    if (entries.size >= 200) entries.delete(entries.keys().next().value);
    entries.set(key, { entry: created, startedAt: Date.now() });
    return { entry: created, isNew: true };
  };
}
