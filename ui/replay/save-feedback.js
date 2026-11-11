import { element, replayState } from './state.js';
import { replayApi } from './api.js';
import { renderEvent } from './render-event.js';

/**
 * Ghi điều đã xảy ra và hành vi mong muốn cho hành động đang xem để xuất cùng phiên.
 * @param {Event} event Sự kiện gửi form ghi chú.
 * @return {Promise<void>} Hoàn tất lưu hoặc hiển thị lỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function saveFeedback(event) {
  event.preventDefault();
  const selectedEvent = replayState.events[replayState.index];
  if (!selectedEvent) return;
  const replay = replayState.replay;
  element('save-feedback').disabled = true;
  try {
    const result = await replayApi('/browser-replay/feedback', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: replay.session.id, eventId: selectedEvent.id, actual: element('actual').value, expected: element('expected').value }),
    });
    (replay.session.feedback ||= []).push(result.feedback);
    if (replayState.replay === replay) renderEvent(replayState.index);
    element('status').textContent = 'Đã lưu ghi chú. Tải JSON để dùng làm ví dụ cải thiện code.';
  } catch (error) { element('status').textContent = error.message; }
  finally { element('save-feedback').disabled = !replayState.events.length; }
}
