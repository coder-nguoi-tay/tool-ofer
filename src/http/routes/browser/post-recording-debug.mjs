import { browserSessionLogs } from '../../../logging/browser-logs/state/browser-session-logs.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Bật/tắt ghi JSONL chi tiết cho đúng phiên đang chạy, mặc định 5 phút và tối đa 10 phút.
 * @param {object} request POST gồm sessionId, enabled và durationSeconds tùy chọn.
 * @param {object} response Phản hồi thời hạn debug hoặc lỗi dữ liệu.
 * @return {Promise<boolean>} True khi API nhận yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function handlePostRecordingDebug(request, response) {
  if (request.method !== 'POST' || request.url !== '/browser-replay/recording-debug') return false;
  try {
    const body = JSON.parse(await readRequestBody(request));
    const duration = body.durationSeconds ?? 300;
    if (typeof body.enabled !== 'boolean' || !Number.isInteger(duration) || duration < 1 || duration > 600) {
      respondWithJson(response, 400, { error: 'Chọn bật/tắt; thời hạn ghi chi tiết từ 1 đến 600 giây.' }); return true;
    }
    const session = [...browserSessionLogs.keys()].find(item => item.recordingId === body.sessionId && !item.isClosed);
    if (!session) { respondWithJson(response, 404, { error: 'Phiên đã kết thúc hoặc không còn chạy.' }); return true; }
    session.recorderDebugUntil = body.enabled ? Date.now() + duration * 1000 : 0;
    session.addBrowserLog?.({ type: 'recording_mode_changed', source: 'user', detail: body.enabled ? `Bật ghi chi tiết ${duration} giây cho phiên này.` : 'Tắt ghi chi tiết, trở lại ghi tiến trình.' });
    if (!body.enabled) await session.flushRecorderLogs?.();
    respondWithJson(response, 200, { success: true, debugUntil: session.recorderDebugUntil });
  } catch { respondWithJson(response, 400, { error: 'Không đọc được yêu cầu đổi chế độ ghi log.' }); }
  return true;
}
