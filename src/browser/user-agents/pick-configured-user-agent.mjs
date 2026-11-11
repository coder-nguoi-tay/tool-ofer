/**
 * Lấy ngẫu nhiên một UA trong file cấu hình và thay số phiên bản Chrome bằng bản engine thật,
 * để UA, Client Hints và engine luôn khớp nhau.
 *
 * @param {string[]} agents UA đã lọc theo hệ điều hành.
 * @param {number} seed Seed của phiên.
 * @return {((version: string) => string)|null} Hàm dựng UA theo phiên bản, null nếu không có UA cấu hình.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function pickConfiguredUserAgent(agents, seed) {
  if (!agents?.length) return null;
  const picked = agents[Math.abs(seed) % agents.length];
  return v => picked.replace(/(Chrome|CriOS)\/[\d.]+/g, `$1/${v}`);
}
