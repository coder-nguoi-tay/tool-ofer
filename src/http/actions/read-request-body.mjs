/**
 * Đọc nội dung yêu cầu POST giới hạn tối đa 1 MB.
 *
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @return {Promise<string>} Nội dung yêu cầu dạng chuỗi.
 * @throws {Error} Khi yêu cầu vượt giới hạn kích thước.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let requestBody = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      requestBody += chunk;
      if (requestBody.length > 50_000_000) {
        reject(new Error('Dữ liệu yêu cầu vượt quá giới hạn 50 MB.'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(requestBody));
    request.on('error', reject);
  });
}
