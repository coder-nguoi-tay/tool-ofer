/**
 * Lỗi xác minh IP qua dịch vụ độc lập; không kết luận proxy đang dùng bị hỏng.
 *
 * @extends Error
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-14
 */
export class IpVerificationError extends Error {
  /**
   * Tạo lỗi riêng để luồng mở trình duyệt dừng thay vì loại proxy theo lỗi dịch vụ IP.
   *
   * @param {string} message Mô tả an toàn, không chứa dữ liệu xác thực proxy.
   * @param {unknown} [cause] Lỗi gốc khi điều hướng hoặc phân tích phản hồi thất bại.
   * @return {void} Khởi tạo lỗi xác minh IP.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-10-14
   */
  constructor(message, cause) {
    super(message, {
      cause
    });
    this.name = 'IpVerificationError';
    this.code = 'IP_VERIFICATION_UNAVAILABLE';
  }
}
