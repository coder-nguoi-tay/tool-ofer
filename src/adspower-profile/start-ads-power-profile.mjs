import { requestAdsPower } from './request-ads-power.mjs';

/**
 * Mở SunBrowser của profile và nhận WebSocket CDP cho Playwright.
 *
 * @param {string} apiKey Khóa Local API.
 * @param {string} profileId ID profile cần mở.
 * @param {object|typeof fetch} [options={}] Tùy chọn khởi chạy (launchArgs) hoặc hàm fetch.
 * @param {typeof fetch} [request=fetch] Hàm HTTP để thử nghiệm.
 * @return {Promise<string>} WebSocket CDP của trình duyệt.
 * @throws {Error} Khi AdsPower không trả điểm kết nối CDP.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function startAdsPowerProfile(apiKey, profileId, options = {}, request = fetch) {
  if (typeof options === 'function') {
    request = options;
    options = {};
  }
  const payload = {
    profile_id: profileId,
    last_opened_tabs: '0',
    proxy_detection: '0',
    cdp_mask: '1'
  };
  const launchArgs = Array.isArray(options.launchArgs) ? [...options.launchArgs] : [];
  // Mặc định đưa cửa sổ ra ngoài màn hình (-20000,-20000) và thu nhỏ để không chớp lên Desktop lúc mở
  if (!launchArgs.some(arg => typeof arg === 'string' && (arg.startsWith('--window-position') || arg.startsWith('--headless')))) {
    launchArgs.push('--window-position=-20000,-20000');
  }
  if (!launchArgs.some(arg => typeof arg === 'string' && arg.startsWith('--start-minimized'))) {
    launchArgs.push('--start-minimized');
  }
  if (launchArgs.length > 0) {
    payload.launch_args = launchArgs;
  }
  // Chạy trong app: SunBrowser headless, không có cửa sổ nên không hiện icon trên Dock.
  if (options.headless) payload.headless = '1';
  const started = await requestAdsPower(apiKey, '/api/v2/browser-profile/start', payload, request);
  if (!started.ws?.puppeteer) throw new Error('AdsPower mở profile nhưng không trả CDP URL.');
  return started.ws.puppeteer;
}
export { startAdsPowerProfile };
