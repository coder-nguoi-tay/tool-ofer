import { DEVICE_PROFILES } from '../../../runtime/constants/device-profiles.mjs';
import { autoRefill } from '../../../runtime/constants/auto-refill.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API device-profiles.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetDeviceProfiles(request, response) {
  if (request.method === 'GET' && request.url === '/device-profiles') {
    respondWithJson(response, 200, {
      available: Object.entries(DEVICE_PROFILES).map(([id, p]) => ({
        id,
        label: p.label
      })),
      selected: autoRefill.deviceProfiles
    });
    return true;
  }
  return false;
}
