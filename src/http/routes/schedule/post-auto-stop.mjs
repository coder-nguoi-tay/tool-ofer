import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { getAutoStopSchedule, scheduleAutoStop, cancelAutoStop } from '../../../runtime/auto-stop-scheduler.mjs';
import { closeActiveBrowsers } from '../../../browser/actions/close-active-browsers.mjs';

/**
 * Xử lý API đặt / hủy / đọc lịch hẹn giờ tự động dừng trình duyệt (/auto-stop/schedule).
 *
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
export async function handlePostAutoStopSchedule(request, response) {
  if (request.url === '/auto-stop/execute' && request.method === 'POST') {
    try {
      const res = await closeActiveBrowsers({ preserveLeadSessions: true });
      respondWithJson(response, 200, {
        success: true,
        ...res
      });
    } catch (err) {
      respondWithJson(response, 400, {
        error: err.message
      });
    }
    return true;
  }
  if (request.url === '/auto-stop/schedule') {
    if (request.method === 'GET') {
      respondWithJson(response, 200, {
        schedule: getAutoStopSchedule()
      });
      return true;
    }
    if (request.method === 'POST') {
      try {
        const body = JSON.parse(await readRequestBody(request) || '{}');
        if (body.enabled && body.time) {
          const schedule = scheduleAutoStop(body.time, () => closeActiveBrowsers({ preserveLeadSessions: true }));
          respondWithJson(response, 200, {
            success: true,
            schedule
          });
        } else {
          cancelAutoStop();
          respondWithJson(response, 200, {
            success: true,
            schedule: null
          });
        }
      } catch (err) {
        respondWithJson(response, 400, {
          error: err.message
        });
      }
      return true;
    }
  }
  return false;
}
