import { randomUUID } from 'node:crypto';
import { persistedBrowserLogs } from '../../../logging/browser-logs/state/persisted-browser-logs.mjs';
import { getSessionReplay } from '../../../logging/replay/get-session-replay.mjs';
import { savePersistedBrowserLogs } from '../../../logging/browser-logs/save-persisted-browser-logs.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Gắn kết quả thực tế và mong muốn vào một hành động để làm ví dụ sửa/huấn luyện code.
 * @param {object} request Yêu cầu HTTP với sessionId, eventId, actual và expected.
 * @param {object} response Phản hồi lưu ghi chú.
 * @return {Promise<boolean>} True khi đã xử lý yêu cầu ghi chú.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostReplayFeedback(request, response) {
  if (request.method !== 'POST' || request.url !== '/browser-replay/feedback') return false;
  try {
    const body = JSON.parse(await readRequestBody(request));
    const session = persistedBrowserLogs.find(item => item.id === body.sessionId);
    const replay = getSessionReplay(body.sessionId);
    if (!session || !replay.events.some(event => event.id === body.eventId)) {
      respondWithJson(response, 404, { error: 'Phiên hoặc hành động không còn tồn tại.' }); return true;
    }
    if (typeof body.expected !== 'string' || !body.expected.trim() || body.expected.length > 4000 || typeof body.actual !== 'string' || body.actual.length > 4000) {
      respondWithJson(response, 400, { error: 'Nhập kết quả mong muốn; mỗi nội dung tối đa 4000 ký tự.' }); return true;
    }
    const feedback = { id: randomUUID(), eventId: body.eventId, actual: body.actual.trim(), expected: body.expected.trim(), createdAt: new Date().toISOString() };
    (session.feedback ||= []).push(feedback);
    if (!await savePersistedBrowserLogs()) {
      session.feedback.splice(session.feedback.indexOf(feedback), 1);
      respondWithJson(response, 500, { error: 'Không ghi được dữ liệu xuống ổ đĩa; ghi chú chưa được lưu.' }); return true;
    }
    respondWithJson(response, 200, { success: true, feedback });
  } catch { respondWithJson(response, 400, { error: 'Không đọc được dữ liệu ghi chú.' }); }
  return true;
}
