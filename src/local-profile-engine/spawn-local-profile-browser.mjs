import { buildLocalBrowserArgs } from './build-local-browser-args.mjs';
import { resolveBrowserExecutable } from './resolve-browser-executable.mjs';
import { spawn } from 'node:child_process';
import { waitForDevToolsActivePort } from './wait-for-dev-tools-active-port.mjs';

/**
 * Khởi tạo tiến trình trình duyệt độc lập với profile cục bộ, trả về wsUrl để Playwright kết nối.
 *
 * @param {object} options Cấu hình profile, proxy, tile, locale, executable, WebRTC và headless.
 * @return {Promise<{proc: object, wsUrl: string, profilePath: string}>}
 * @throws {Error} Khi không tìm thấy trình duyệt hoặc trình duyệt không mở được cổng CDP.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function spawnLocalProfileBrowser({
  profilePath,
  proxyUrl = null,
  tile = null,
  locale = 'en-US',
  executablePath = null,
  headless = false,
  protectWebRtc = true
}) {
  const bin = executablePath || resolveBrowserExecutable();
  if (!bin) throw new Error('Không tìm thấy Google Chrome hoặc Chromium trên máy để khởi chạy profile cục bộ.');
  const args = buildLocalBrowserArgs({
    profilePath,
    proxyUrl,
    tile,
    locale,
    headless,
    protectWebRtc
  });
  const proc = spawn(bin, args, {
    stdio: 'ignore',
    detached: false
  });
  proc.on('error', err => {
    console.error('[LocalProfileEngine] Lỗi tiến trình trình duyệt:', err.message);
  });
  try {
    const wsUrl = await Promise.race([waitForDevToolsActivePort(profilePath, 15000), new Promise((_, reject) => {
      proc.once('error', reject);
      proc.once('exit', code => reject(new Error(`Trình duyệt đóng trước khi mở CDP (mã ${code}).`)));
    })]);
    return {
      proc,
      wsUrl,
      profilePath
    };
  } catch (error) {
    proc.kill('SIGTERM');
    throw error;
  }
}
export { spawnLocalProfileBrowser };
