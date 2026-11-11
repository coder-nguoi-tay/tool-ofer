import { element, replayState } from './state.js';
import { replayApi } from './api.js';
import { loadSession } from './load-session.js';

/**
 * Bật ghi chi tiết 5 phút hoặc tắt ngay cho phiên đang chọn, không áp sang slot khác.
 * @param {boolean} enabled Có bật ghi chi tiết hay không.
 * @return {Promise<void>} Cập nhật trạng thái ghi hoặc hiển thị lỗi API.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function setRecordingDebug(enabled) {
  const sessionId = replayState.replay?.session.id;
  if (!sessionId) return;
  element('debug-start').disabled = element('debug-stop').disabled = true;
  try {
    await replayApi('/browser-replay/recording-debug', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, enabled, durationSeconds: 300 }),
    });
    if (element('sessions').value === sessionId) await loadSession();
  } catch (error) {
    if (element('sessions').value === sessionId) {
      element('status').textContent = error.message;
      element('debug-start').disabled = element('debug-stop').disabled = !replayState.replay?.session.recordingActive;
    }
  }
}
