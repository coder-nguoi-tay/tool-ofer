/**
 * Tạo CSV từ sổ proxy đã thử để người dùng lưu báo cáo kết nối qua nhiều phiên.
 *
 * Báo cáo chỉ phản ánh trạng thái mở trang và IP exit do app ghi nhận; nó không đánh dấu
 * trạng thái chuyển đổi hoặc hoàn tất offer.
 *
 * @param {{version: number, proxies: Record<string, object>}} history Sổ lịch sử proxy.
 * @return {string} Nội dung CSV UTF-8 không chứa thông tin đăng nhập proxy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function buildProxyUsageHistoryCsv(history) {
  const csvCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const records = Object.values(history.proxies).sort((left, right) => String(left.attemptedAt ?? '').localeCompare(String(right.attemptedAt ?? '')));
  return [['proxy', 'trang_thai', 'ip_exit', 'offer_so', 'website', 'url_cuoi', 'profile_id', 'bat_dau', 'ket_thuc', 'ghi_chu'].map(csvCell).join(','), ...records.map(record => [record.proxy, record.status, record.exitIp, record.offerNumber ?? record.streamRole ?? 1, record.websiteUrl, record.finalUrl, record.profileId, record.attemptedAt, record.completedAt, record.reason].map(csvCell).join(','))].join('\n');
}
