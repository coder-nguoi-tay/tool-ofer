import { DEVICE_PROFILES } from '../../../runtime/constants/device-profiles.mjs';
import { autoRefill } from '../../../runtime/constants/auto-refill.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { saveSavedDeviceProfiles } from '../../../browser/actions/save-saved-device-profiles.mjs';

/**
 * Xử lý API device-profiles.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostDeviceProfiles(request, response) {
  if (request.method === 'POST' && request.url === '/device-profiles') {
    const body = JSON.parse(await readRequestBody(request));
    const valid = (body.profiles ?? []).filter(id => DEVICE_PROFILES[id]);
    autoRefill.deviceProfiles = valid.length > 0 ? valid : ['windows'];
    void saveSavedDeviceProfiles();
    respondWithJson(response, 200, {
      selected: autoRefill.deviceProfiles
    });
    return true;
  }
  return false;
}
