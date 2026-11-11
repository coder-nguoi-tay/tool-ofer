import { IpVerificationError } from './ip-verification-error.mjs';
import { activeExitIpLocks } from '../../runtime/constants/active-exit-ip-locks.mjs';
import { browserIpCheckUrls } from '../../runtime/constants/browser-ip-check-urls.mjs';
import { isExitIpCurrentlyInUse } from './is-exit-ip-currently-in-use.mjs';
import { safeNormalizeUrl } from '../configuration.mjs';

/**
 * Xác minh IP thoát qua chính phiên trình duyệt, lưu IP và loại IP đã dùng.
 *
 * @param {object} browser Phiên Playwright có phương thức newPage().
 * @param {Set<string>} usedExitIps Những IP đã ghi trong lịch sử và lượt hiện tại.
 * @param {(ip: string) => Promise<void>} onExitIp Lưu IP vào lịch sử trước khi dùng.
 * @param {string} [websiteUrl=''] URL trang đích để phân tách phạm vi IP đã dùng.
 * @return {Promise<string>} IP thoát đã xác minh.
 * @throws {IpVerificationError|Error} Khi dịch vụ IP lỗi hoặc IP đã dùng cho trang đích này.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function verifyBrowserExitIp(browser, usedExitIps, onExitIp, websiteUrl = '', checkDuplicate = true) {
  const ipPage = await browser.newPage();
  let exitIp;
  const failures = [];
  try {
    for (const checkUrl of browserIpCheckUrls) {
      try {
        const response = await ipPage.goto(checkUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 8_000
        });
        if (!response || response.status() < 200 || response.status() >= 300) {
          throw new IpVerificationError(`trả HTTP ${response?.status() ?? 'không có phản hồi'}`);
        }
        const bodyText = await ipPage.evaluate(() => document.body?.innerText || '').catch(() => '');
        let ipResponse = null;
        try {
          ipResponse = JSON.parse(bodyText);
        } catch {
          const match = bodyText.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
          if (match) ipResponse = {
            ip: match[0]
          };
        }
        if (typeof ipResponse?.ip !== 'string' || !ipResponse.ip.trim()) {
          throw new IpVerificationError('không trả địa chỉ IP');
        }
        exitIp = ipResponse.ip.trim();
        break;
      } catch (error) {
        const errMsg = error.message || '';
        const reason = error instanceof IpVerificationError ? error.message : errMsg.includes('Timeout') ? 'timeout quá 8s' : 'không kết nối được';
        failures.push(`${new URL(checkUrl).host}: ${reason}`);

        // Fast-fail: Nếu proxy chết hẳn ở tầng mạng/kết nối, dừng ngay không thử các URL tiếp theo
        const isProxyDead = /ERR_PROXY_CONNECTION_FAILED|ERR_TUNNEL_CONNECTION_FAILED|ERR_SOCKS_CONNECTION_FAILED|ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_NAME_NOT_RESOLVED|ERR_TIMED_OUT|ECONNREFUSED|EHOSTUNREACH/i.test(errMsg);
        if (isProxyDead) {
          break;
        }
      }
    }
    if (!exitIp) {
      throw new IpVerificationError(`Tất cả dịch vụ xác minh IP đều lỗi (${failures.join(' | ')}).`);
    }
  } finally {
    await ipPage.close().catch(() => {});
  }
  await onExitIp(exitIp);
  // Kiểm tra xung đột IP đồng thời: tuyệt đối không mở 2 cửa sổ có cùng exit IP cùng một thời điểm
  if (isExitIpCurrentlyInUse(exitIp)) {
    throw new Error(`IP ${exitIp} đang được sử dụng ở một cửa sổ khác; tránh mở trùng đồng thời.`);
  }
  const normUrl = websiteUrl ? safeNormalizeUrl(websiteUrl) : '';
  const keyWithUrl = normUrl ? `${exitIp}::${normUrl}` : exitIp;
  if (checkDuplicate && usedExitIps.has(keyWithUrl)) {
    throw new Error(`IP ${exitIp} đã được dùng trước đây cho trang đích này`);
  }
  activeExitIpLocks.add(exitIp);
  usedExitIps.add(keyWithUrl);
  return exitIp;
}
