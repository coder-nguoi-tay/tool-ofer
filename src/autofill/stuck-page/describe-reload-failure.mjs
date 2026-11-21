/**
 * Phân loại lỗi điều hướng để giao diện hiển thị được lý do mà không ghi URL hoặc dữ liệu form.
 * @param {unknown} error Lỗi trình duyệt báo khi tải lại.
 * @param {boolean} pageClosed Tab đã đóng tại thời điểm bắt lỗi.
 * @return {{reasonCode: string, detail: string}} Mã và mô tả cố định dùng cho nhật ký phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20 (cập nhật 2026-11-21)
 */
export function describeReloadFailure(error, pageClosed) {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (pageClosed || error?.name === 'TargetClosedError' || /^(?:page\.(?:goto|reload): )?Target page, context or browser has been closed/i.test(message)) {
    return { reasonCode: 'page_closed', detail: 'Tải lại thất bại vì tab hoặc trình duyệt đã đóng.' };
  }
  if (error?.name === 'TimeoutError') {
    return { reasonCode: 'navigation_timeout', detail: 'Hết thời gian chờ tải lại trang.' };
  }
  if (/^(?:page\.(?:goto|reload): )?net::ERR_ABORTED\b/.test(message)) {
    return { reasonCode: 'navigation_aborted', detail: 'Trình duyệt đã hủy lượt tải lại trang.' };
  }
  if (/^(?:page\.(?:goto|reload): )?net::ERR_/.test(message)) {
    return { reasonCode: 'network_error', detail: 'Trình duyệt báo lỗi mạng trong khi tải lại trang.' };
  }
  return { reasonCode: 'navigation_error', detail: 'Tải lại trang thất bại, chưa xác định được nguyên nhân.' };
}
