import { element, replayState } from './state.js';
import { renderEvent } from './render-event.js';

/**
 * Lọc dòng thời gian theo tab và các dấu hiệu lỗi/đứng, giữ nguyên thứ tự ghi nhận.
 * @return {void} Dựng danh sách và hiển thị hành động đầu tiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function renderTimeline() {
  const state = replayState;
  clearInterval(state.timer); state.timer = null;
  element('play').textContent = 'Phát từng bước';
  const diagnostics = new Set(state.replay?.diagnosticEventTypes || []);
  state.events = (state.replay?.events || []).filter(event =>
    (!element('tabs').value || String(event.tabId) === element('tabs').value) &&
    (!element('errors-only').checked || diagnostics.has(event.type)));
  const options = document.createDocumentFragment();
  for (const event of state.events) {
    const option = document.createElement('option');
    option.textContent = `${diagnostics.has(event.type) ? '⚠ ' : ''}#${event.sequence} · ${String(event.time).slice(11, 23)} · tab ${event.tabId ?? '?'} · ${event.kind || event.type} · ${(event.detail || '').slice(0, 95)}`;
    options.append(option);
  }
  element('events').replaceChildren(options);
  renderEvent(0);
}
