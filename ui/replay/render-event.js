import { element, replayState } from './state.js';

/**
 * Hiển thị một hành động cùng ảnh bằng chứng của chính tab đó và ghi chú liên quan.
 * @param {number} index Vị trí trong chuỗi sự kiện đang được lọc.
 * @return {void} Cập nhật nội dung xem lại, không chạy lại thao tác trong trình duyệt.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function renderEvent(index) {
  const state = replayState;
  state.index = Math.max(0, Math.min(index, state.events.length - 1));
  const event = state.events[state.index];
  element('screenshot').hidden = element('download-html').hidden = true;
  element('snapshot-label').textContent = '';
  element('actual').value = element('expected').value = '';
  element('feedback-list').replaceChildren();
  element('save-feedback').disabled = !event;
  element('previous').disabled = !event || state.index === 0;
  element('next').disabled = !event || state.index === state.events.length - 1;
  element('play').disabled = !event;
  element('position').max = Math.max(0, state.events.length - 1);
  element('position').value = element('events').selectedIndex = state.index;
  element('position-label').textContent = event ? `${state.index + 1} / ${state.events.length} sự kiện` : 'Không có sự kiện khớp bộ lọc.';
  element('event-title').textContent = event ? `#${event.sequence} · ${event.kind || event.type} · ${event.time}` : 'Không có sự kiện';
  element('event-url').textContent = event?.pageUrl || event?.url || '';
  element('event-detail').textContent = event ? JSON.stringify(event, null, 2) : '';
  if (!event) return;
  const originalIndex = state.replay.events.findIndex(item => item.id === event.id);
  const linkedEvidence = state.replay.events.find(item => item.id === event.snapshotEventId);
  const evidence = linkedEvidence?.screenshotPath ? linkedEvidence : state.replay.events.slice(0, originalIndex + 1).reverse().find(item => item.tabId === event.tabId && item.screenshotPath);
  const htmlEvidence = event.htmlPath ? event : linkedEvidence?.htmlPath ? linkedEvidence : evidence;
  if (linkedEvidence) element('event-detail').textContent = JSON.stringify({ ...event, evidence: linkedEvidence }, null, 2);
  const params = new URLSearchParams({ sessionId: state.replay.session.id, eventId: evidence?.id || event.id, kind: 'screenshot' });
  if (evidence) {
    element('screenshot').src = `/browser-replay/artifact?${params}`;
    element('screenshot').hidden = false;
    element('snapshot-label').textContent = `Ảnh sau nhóm thao tác, chụp lúc ${evidence.capturedAt || evidence.time}${evidence.id !== event.id ? ' · ảnh tham chiếu gần nhất của tab' : ''}.`;
  } else element('snapshot-label').textContent = event.snapshotError || 'Chưa có ảnh cho mốc này (tab có thể đã chuyển trang/đóng).';
  if (htmlEvidence?.htmlPath) {
    params.set('eventId', htmlEvidence.id); params.set('kind', 'html');
    element('download-html').href = `/browser-replay/artifact?${params}`;
    element('download-html').hidden = false;
  }
  for (const feedback of state.replay.session.feedback || []) {
    if (feedback.eventId !== event.id) continue;
    const item = document.createElement('li');
    item.textContent = `Thực tế: ${feedback.actual}\nMong muốn: ${feedback.expected}`;
    element('feedback-list').append(item);
  }
}
