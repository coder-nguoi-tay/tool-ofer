// Đo bằng curl thuần trên 10 session TrustSource mới: IP đổi ở ~giây 4-5 và ~giây 9-10 rồi giữ nguyên (sticky).
// Nên chỉ nhận IP khi đã qua 10 giây kể từ lần chạm đầu VÀ hai lần tra liên tiếp (cách 3 giây) ra cùng IP.
const PROBE_INTERVAL_MS = 3000;
const MIN_SETTLE_MS = 10_000;
const MAX_WAIT_MS = 30_000;

/**
 * Chờ IP của một session proxy ổn định rồi mới dùng: IP để kiểm trùng/khoá, múi giờ và IP trình duyệt thấy đều là IP
 * này. Proxy cũ đã ổn định thì vẫn mất tối thiểu ~10 giây (không phân biệt được session mới hay cũ trước khi đo).
 * @param {object} proxy Proxy đã phân tích (dùng để ghi log/khoá, không dùng trực tiếp ở đây).
 * @param {Function} probe Tra một lần qua proxy, trả {ip, ...} hoặc null khi lỗi.
 * @param {{sleep?: Function, now?: Function, intervalMs?: number, minSettleMs?: number, maxWaitMs?: number}} [options]
 *   Thay đồng hồ khi test.
 * @return {Promise<object|null>} Kết quả lần tra cuối (IP đã ổn định); null khi proxy lỗi hoặc không ổn định trong 30 giây.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export async function waitForStableProxyIp(proxy, probe, {
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now,
  intervalMs = PROBE_INTERVAL_MS, minSettleMs = MIN_SETTLE_MS, maxWaitMs = MAX_WAIT_MS
} = {}) {
  const startedAt = now();
  let previous = await probe();
  if (!previous?.ip) return null;
  while (now() - startedAt < maxWaitMs) {
    await sleep(intervalMs);
    const current = await probe();
    if (!current?.ip) return null;
    if (current.ip === previous.ip && now() - startedAt >= minSettleMs) return current;
    previous = current;
  }
  return null;
}
