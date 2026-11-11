/**
 * Lớp lỗi riêng cho việc gọi API kiểm tra lead, giúp phân biệt rạch ròi giữa
 * "Lỗi kết nối / Cookie hết hạn" và "API hoạt động bình thường nhưng chưa có lead".
 *
 * @extends Error
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
class LeadApiError extends Error {
  /**
   * Khởi tạo lỗi API.
   *
   * @param {string} message Thông báo lỗi rõ ràng.
   * @param {'AUTH_EXPIRED'|'NETWORK_ERROR'|'SERVER_ERROR'|'INVALID_RESPONSE'} code Mã loại lỗi.
   * @param {object} [details={}] Chi tiết bổ sung (status, location, preview).
   */
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'LeadApiError';
    this.code = code;
    this.details = details;
  }
}
export { LeadApiError };
