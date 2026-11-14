import { normalizeIpAddress } from '../../lead-check/normalize-ip-address.mjs';
import { createProxyUsageKey } from './create-proxy-usage-key.mjs';
import { readProxyUsageHistory } from './read-proxy-usage-history.mjs';
import { persistProxyUsageHistory } from './persist-proxy-usage-history.mjs';

/**
 * Proxy "sticky" vẫn đổi IP theo từng kết nối: mỗi IP phiên thấy được thêm vào tập IP của phiên (để đối chiếu lead)
 * và ghi lịch sử như IP đã dùng cho offer này, để lượt sau không mở lại offer bằng IP đó.
 * @param {object} session Phiên có exitIps (Set), proxy và websiteUrl.
 * @param {string|null} ip IP vừa thấy.
 * @param {object} [io] Hàm đọc/ghi lịch sử, thay bằng mock khi test.
 * @return {Promise<boolean>} True khi là IP mới của phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function recordObservedExitIp(session, ip, { read = readProxyUsageHistory, persist = persistProxyUsageHistory } = {}) {
  const normalized = normalizeIpAddress(ip);
  if (!normalized || !session?.exitIps || session.exitIps.has(normalized)) return false;
  session.exitIps.add(normalized);
  session.addBrowserLog?.({ type: 'session_exit_ip_observed', ip: normalized,
    detail: `Proxy ra thêm IP ${normalized}; tính vào IP của phiên khi kiểm lead và khoá không dùng lại cho offer này.` });
  if (!session.proxy) return true;
  try {
    // Đọc mới ngay trước khi ghi để không ghi đè mục của phiên khác.
    const history = await read();
    history.proxies[`${createProxyUsageKey(session.proxy, 1, session.websiteUrl)}:ip:${normalized}`] = {
      exitIp: normalized, websiteUrl: session.websiteUrl || '', status: 'success',
      reason: 'IP phụ của phiên: proxy đổi IP giữa chừng', time: new Date().toISOString()
    };
    await persist(history);
  } catch {}
  return true;
}
