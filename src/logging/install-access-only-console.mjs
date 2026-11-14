import { isAccessOnlyLogging } from './is-access-only-logging.mjs';

const installed = new WeakSet();

/**
 * Tạm ngừng console thao tác/AI/HTTP; chỉ giữ lỗi mở trang, vòng đời lead/đóng phiên và lỗi tiến trình nghiêm trọng.
 * @param {object} output Console đích, mặc định console của ứng dụng.
 * @return {void} Cài bộ lọc một lần; đặt LOG_MODE=full trước khi chạy để bật lại nhật ký đầy đủ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export function installAccessOnlyConsole(output = console) {
  process.env.AUTOLEADPC_LOG_MODE ||= 'access';
  if (!isAccessOnlyLogging() || installed.has(output)) return;
  installed.add(output);
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = output[method].bind(output);
    output[method] = (...values) => {
      if (!isAccessOnlyLogging() || /^\[(PageAccess|Process|Lifecycle)\]/.test(String(values[0] || ''))) original(...values);
    };
  }
}
