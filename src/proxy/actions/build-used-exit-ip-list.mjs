/**
 * Gom các IP exit đã dùng từ lịch sử proxy để hiện trong giao diện.
 *
 * Mỗi IP một dòng, giữ lần dùng mới nhất và đếm số lần xuất hiện; bản ghi chưa có IP bị bỏ
 * qua vì chưa tiêu IP nào. Đây chính là tập IP mà lượt mở sau sẽ từ chối dùng lại.
 *
 * @param {object} usageHistory Lịch sử proxy đã đọc từ đĩa.
 * @return {{exitIp: string, proxy: string, status: string, usedAt: string, uses: number}[]} Danh sách IP, mới nhất trước.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function buildUsedExitIpList(usageHistory) {
  const byIp = new Map();
  for (const record of Object.values(usageHistory?.proxies ?? {})) {
    if (!record?.exitIp) continue;
    const usedAt = record.completedAt ?? record.attemptedAt ?? '';
    const existing = byIp.get(record.exitIp);
    if (existing && existing.usedAt >= usedAt) {
      existing.uses += 1;
      continue;
    }
    byIp.set(record.exitIp, {
      exitIp: record.exitIp,
      proxy: record.proxy ?? '',
      status: record.status ?? '',
      usedAt,
      uses: (existing?.uses ?? 0) + 1
    });
  }
  return [...byIp.values()].sort((left, right) => right.usedAt.localeCompare(left.usedAt));
}
