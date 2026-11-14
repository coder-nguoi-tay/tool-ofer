import { getMacPublicIp } from '../../../proxy/actions/get-mac-public-ip.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * IP public của máy Mac chạy app (không qua proxy), để mini trên điện thoại hiện đúng IP cần whitelist 711.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function handleGetPublicIp(request, response) {
  if (request.method !== 'GET' || request.url !== '/proxy/public-ip') return false;
  try {
    const ip = await getMacPublicIp();
    if (!ip) throw new Error('không có phản hồi');
    respondWithJson(response, 200, { ip });
  } catch (error) {
    respondWithJson(response, 502, { ip: null, error: `Không tra được IP của máy Mac: ${error.message}` });
  }
  return true;
}
