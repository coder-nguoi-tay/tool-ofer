/**
 * Ước tính số trình duyệt an toàn theo RAM/CPU để tham khảo.
 *
 * Ước tính 1.5 GB cho mỗi cửa sổ Chrome và dành tối đa 50% RAM tổng cho browser để vẫn chừa tài
 * nguyên cho macOS và các app khác. Dùng RAM tổng thay vì RAM trống vì số RAM trống dao
 * động theo app đang mở; số profile còn bị giới hạn theo CPU.
 *
 * @param {number} cores Số nhân CPU.
 * @param {number} totalBytes Tổng RAM tính theo byte.
 * @return {number} Số cửa sổ nên mở cùng lúc, tối thiểu 1.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function recommendedMaxAlive(cores, totalBytes) {
  const perBrowserGb = 1.5;
  const ramBudgetFraction = 0.5;
  const byRam = Math.floor(totalBytes / 1024 ** 3 * ramBudgetFraction / perBrowserGb + 1e-9);
  return Math.max(1, Math.min(cores, byRam));
}
