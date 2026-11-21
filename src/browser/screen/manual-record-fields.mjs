/**
 * Cho giao diện cùng origin trên máy vận hành chọn dữ liệu hồ sơ của tab.
 * @param {import('node:http').IncomingMessage} request Yêu cầu POST của Screen View.
 * @return {boolean} True khi trình duyệt kết nối trực tiếp tới giao diện loopback.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function canPickLocalRecordField(request) {
  const { headers, socket } = request;
  if (!headers || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(socket?.remoteAddress)) return false;
  if (Object.keys(headers).some(name => name === 'forwarded' || name.startsWith('x-forwarded-') || name === 'cf-connecting-ip')) return false;
  const port = socket.localPort === 80 ? '' : ':' + socket.localPort;
  return ['localhost', '127.0.0.1', '[::1]'].some(host =>
    headers.host === host + port && headers.origin === 'http://' + headers.host);
}

/**
 * Liệt kê cột nguồn của đúng hồ sơ đang gán cho tab và dữ liệu được cấp riêng cho phiên.
 * @param {object} page Tab người dùng đang xem.
 * @param {object} [session] Phiên chứa tab này.
 * @return {{record: object|undefined, values: Map<string, string>}} Cột và giá trị giữ tại backend cho lần chèn tay.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function getManualRecordFields(page, session) {
  const record = page._assignedRecord ?? session?.currentRecord;
  const values = new Map();
  for (const [key, value] of Object.entries(record || {})) {
    if (!key.startsWith('_') && ['string', 'boolean', 'number'].includes(typeof value) && value !== '') {
      values.set(key, String(value));
    }
  }
  for (const key of ['assignedEmail', 'assignedPass', 'assignedRecover']) {
    if (typeof session?.[key] === 'string' && session[key] !== '') values.set(key, session[key]);
  }
  return { record, values };
}
