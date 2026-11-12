const polling = new Set(['GET /state', 'GET /proxy-queue', 'GET /bandwidth', 'POST /toffers/overview', 'GET /browser-logs', 'GET /telegram/config']);
// UI hỏi theo slot liên tục (thumbnail, danh sách tab, thao tác chuột/phím Screen View): bỏ khi thành công.
const pollingBySlot = /^(GET \/screen\/(snapshot|tabs)|POST \/screen\/input)\/\d+$/;
// Luồng SSE Screen View bị ngắt mỗi khi đóng modal: không phải lỗi.
const streamPath = /^GET \/screen\/stream\/\d+$/;

/**
 * Ghi một dòng sau phản hồi; bỏ polling thành công, giữ lỗi và kết nối bị ngắt, không ghi query.
 * @param {object} request Request HTTP của giao diện.
 * @param {object} response Response cần theo dõi trạng thái cuối.
 * @return {void} Gắn callback kết thúc, không thay đổi route hoặc response.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function attachRequestLogging(request, response) {
  const path = String(request.url || '/').split('?')[0];
  const method = request.method || 'GET';
  response.once('finish', () => {
    const key = `${method} ${path}`;
    if (!(polling.has(key) || pollingBySlot.test(key)) || response.statusCode >= 400) console.log('[HTTP]', method, path, response.statusCode);
  });
  response.once('close', () => {
    if (!response.writableFinished && !streamPath.test(`${method} ${path}`)) console.log('[HTTP]', method, path, 'aborted');
  });
}
