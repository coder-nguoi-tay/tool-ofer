const pages = new WeakMap();

/**
 * Đếm một phút trống liên tục, tối đa hai reload cùng trang rồi dành một lượt chẩn đoán AI.
 * @param {object} page Tab giữ bộ đếm xuyên reload, độc lập với các tab khác.
 * @param {string} url URL trước khi đọc snapshot.
 * @param {object|null} snapshot Snapshot trống đã xét mọi iframe.
 * @param {number} now Thời gian hiện tại phục vụ quyết định và test.
 * @return {object} action: none, waiting, reload, ai hoặc exhausted; reloads đã dành lượt.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function getLateProgressRecoveryAction(page, url, snapshot, now = Date.now()) {
  const parsed = new URL(url);
  const key = parsed.origin + parsed.pathname;
  const progressKey = JSON.stringify(snapshot?.frames?.map(frame => frame.progress) || []);
  let state = pages.get(page);
  if (!snapshot) { if (state) state.since = null; return { action: 'none' }; }
  if (!snapshot.empty) { pages.delete(page); return { action: 'none' }; }
  if (!state || state.key !== key || state.progressKey !== progressKey) { state = { key, progressKey, since: now, reloads: 0, aiRequested: false }; pages.set(page, state); }
  state.since ??= now;
  if (state.aiRequested) return { action: 'exhausted', reloads: state.reloads };
  if (now - state.since < 60_000) return { action: 'waiting', reloads: state.reloads };
  state.since = now;
  if (state.reloads < 2) { state.reloads++; return { action: 'reload', reloads: state.reloads }; }
  state.aiRequested = true;
  return { action: 'ai', reloads: state.reloads };
}
