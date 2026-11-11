import { add711IpWhitelist } from '../../../proxy/provider711.mjs';
import { ensure711Token } from '../../../proxy/provider711.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API 711proxy-update-whitelist.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @throws {Error} Khi dữ liệu không hợp lệ hoặc thao tác không thể hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePost711proxyUpdateWhitelist(request, response) {
  if (request.method === 'POST' && request.url === '/711proxy/update-whitelist') {
    try {
      let ip = null;
      try {
        const body = JSON.parse(await readRequestBody(request));
        if (body?.ip) ip = String(body.ip).trim();
      } catch {}
      if (!ip) {
        const ipRes = await fetch('https://api.ipify.org?format=json');
        const data = await ipRes.json();
        ip = data?.ip;
      }
      if (!ip) throw new Error('Không thể xác định địa chỉ IP máy.');
      const token = await ensure711Token();
      if (!token) {
        respondWithJson(response, 401, {
          error: `Chưa đăng nhập 711proxy hoặc token hết hạn. Vui lòng nhập tài khoản/mật khẩu rồi bấm 'Đăng nhập' để tự thêm IP ${ip} vào whitelist.`,
          ip
        });
        return true;
      }
      await add711IpWhitelist(ip, token);
      respondWithJson(response, 200, {
        ok: true,
        ip,
        message: `Đã thêm IP ${ip} vào whitelist 711proxy thành công!`
      });
    } catch (e) {
      respondWithJson(response, 500, {
        error: e.message
      });
    }
    return true;
  }
  return false;
}
