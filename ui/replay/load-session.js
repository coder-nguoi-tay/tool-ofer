import { element, replayState } from './state.js';
import { replayApi } from './api.js';
import { renderTimeline } from './render-timeline.js';

/**
 * Nạp một phiên đã lưu, bỏ qua kết quả cũ khi người dùng chọn nhanh sang phiên khác.
 * @return {Promise<void>} Hoàn tất nạp dữ liệu hoặc hiển thị lỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function loadSession() {
  const version = ++replayState.requestVersion;
  clearInterval(replayState.timer);
  replayState.replay = null;
  element('debug-start').disabled = element('debug-stop').disabled = true;
  element('export').removeAttribute('href');
  renderTimeline();
  const sessionId = element('sessions').value;
  if (!sessionId) { replayState.replay = null; renderTimeline(); return; }
  element('status').textContent = 'Đang tải hành động…';
  try {
    const replay = await replayApi(`/browser-replay/session?${new URLSearchParams({ sessionId })}`);
    if (version !== replayState.requestVersion) return;
    replayState.replay = replay;
    element('debug-start').disabled = element('debug-stop').disabled = !replay.session.recordingActive;
    element('recording-mode').textContent = replay.session.recorderDebugUntil > Date.now()
      ? `Ghi chi tiết cho phiên này đến ${new Date(replay.session.recorderDebugUntil).toLocaleTimeString('vi-VN')}; sau đó tự trở lại ghi tiến trình.`
      : 'Ghi tiến trình và lỗi. Lỗi mới kèm tối đa 100 thao tác trong 60 giây gần nhất.';
    const tabs = [...new Set(replay.events.map(event => event.tabId).filter(Boolean))];
    element('tabs').replaceChildren(new Option('Tất cả', ''), ...tabs.map(tab => new Option(`Tab ${tab}`, String(tab))));
    element('export').href = `/browser-replay/session?${new URLSearchParams({ sessionId, download: '1' })}`;
    const errors = replay.events.filter(event => replay.diagnosticEventTypes.includes(event.type)).length;
    element('summary').textContent = `${replay.events.length} sự kiện · ${errors} dấu hiệu lỗi/đứng · ${replay.session.endedAt ? 'Phiên đã kết thúc' : 'Phiên chưa ghi nhận kết thúc'}.`;
    element('status').textContent = 'Dữ liệu đã lưu trên máy. Bấm Nạp lại để lấy thêm hành động của phiên đang chạy.';
    renderTimeline();
  } catch (error) { if (version === replayState.requestVersion) element('status').textContent = error.message; }
}
