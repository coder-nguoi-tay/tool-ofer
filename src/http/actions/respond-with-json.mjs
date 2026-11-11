/**
 * Gửi phản hồi JSON cho giao diện.
 *
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @param {number} statusCode Mã trạng thái HTTP.
 * @param {object} responseBody Dữ liệu JSON phản hồi.
 * @return {void} Không trả về giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function respondWithJson(response, statusCode, responseBody) {
  let payload;
  try {
    payload = JSON.stringify(responseBody);
  } catch (stringifyErr) {
    // JSON.stringify nổ (object vòng / BigInt...) → trả thông tin chẩn đoán thay vì im lặng
    // treo request mãi mãi (lỗi trước đây: GET /state không bao giờ trả về khi có log chứa object Playwright).
    try {
      payload = JSON.stringify({
        error: `Không thể serialize response (${stringifyErr.message})`,
        keys: Object.keys(responseBody || {})
      });
    } catch {
      payload = '{"error":"Không thể serialize response"}';
    }
  }
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(payload);
}
