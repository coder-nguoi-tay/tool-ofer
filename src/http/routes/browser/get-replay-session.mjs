import { persistedBrowserLogs } from '../../../logging/browser-logs/state/persisted-browser-logs.mjs';
import { getSessionReplay } from '../../../logging/replay/get-session-replay.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { browserSessionLogs } from '../../../logging/browser-logs/state/browser-session-logs.mjs';

/**
 * Liệt kê phiên nhẹ và xuất toàn bộ sự kiện/ghi chú của một phiên để xem hoặc phân tích code.
 * @param {object} request Yêu cầu HTTP.
 * @param {object} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi yêu cầu thuộc API phiên xem lại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function handleGetReplaySession(request, response) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/browser-replay/sessions') {
    respondWithJson(response, 200, { sessions: persistedBrowserLogs.map(({ logs, ...session }) => ({
      id: session.id, slot: session.slot, offer: session.offer, ip: session.ip,
      startedAt: session.startedAt, endedAt: session.endedAt, eventCount: logs?.length || 0,
    })) });
    return true;
  }
  if (url.pathname !== '/browser-replay/session') return false;
  const replay = getSessionReplay(url.searchParams.get('sessionId'));
  if (!replay) { respondWithJson(response, 404, { error: 'Không tìm thấy phiên.' }); return true; }
  const active = [...browserSessionLogs.keys()].find(session => session.recordingId === replay.session.id && !session.isClosed);
  replay.session.recordingActive = Boolean(active);
  replay.session.recorderDebugUntil = active?.recorderDebugUntil || 0;
  if (url.searchParams.get('download') === '1') {
    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
      'content-disposition': 'attachment; filename="browser-session-training.json"',
    });
    response.end(JSON.stringify(replay, null, 2));
  } else respondWithJson(response, 200, replay);
  return true;
}
