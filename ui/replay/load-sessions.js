import { element } from './state.js';
import { replayApi } from './api.js';
import { loadSession } from './load-session.js';

/**
 * Liệt kê các phiên theo IP và thời gian, giữ lựa chọn khi người dùng nạp lại.
 * @return {Promise<void>} Hoàn tất nạp danh sách và phiên đã chọn.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function loadSessions() {
  try {
    const selectedId = element('sessions').value || new URLSearchParams(location.search).get('sessionId');
    const data = await replayApi('/browser-replay/sessions');
    element('sessions').replaceChildren(...data.sessions.map(session => new Option(`Slot ${session.slot} · ${session.ip} · ${session.startedAt} · ${session.eventCount} sự kiện`, session.id)));
    if (data.sessions.some(session => session.id === selectedId)) element('sessions').value = selectedId;
    if (!data.sessions.length) element('status').textContent = 'Chưa có phiên được ghi. Mở trình duyệt từ AutoLeadPC để bắt đầu.';
    await loadSession();
  } catch (error) { element('status').textContent = error.message; }
}
