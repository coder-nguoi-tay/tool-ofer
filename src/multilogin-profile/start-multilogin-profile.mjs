import { DEFAULT_LAUNCHER_ADDRESS } from './state/launcher-address.mjs';
import { requestMultiloginLauncher } from './request-multilogin-launcher.mjs';

/**
 * Khởi chạy profile Multilogin và nhận WebSocket CDP hoặc HTTP port cho Playwright.
 *
 * @param {object} options Các tham số cấu hình (token, folderId, profileId, launcherUrl, headless).
 * @param {typeof fetch} [request=fetch] Hàm fetch để gửi request hoặc mock test.
 * @return {Promise<string>} Endpoint CDP để Playwright connectOverCDP (vd: http://127.0.0.1:49152).
 * @throws {Error} Khi launcher không trả port hoặc địa chỉ kết nối CDP.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export async function startMultiloginProfile({
  token = '',
  folderId = '',
  profileId,
  launcherUrl = DEFAULT_LAUNCHER_ADDRESS,
  headless = false
} = {}, request = fetch) {
  if (!profileId) throw new Error('Thiếu profileId để khởi chạy Multilogin profile.');

  // Endpoint Multilogin X:
  // GET /api/v2/profile/f/:folderId/p/:profileId/start?automation_type=playwright&headless_mode=:headless
  const query = new URLSearchParams({
    automation_type: 'playwright',
    headless_mode: String(Boolean(headless))
  });
  const path = folderId
    ? `/api/v2/profile/f/${encodeURIComponent(folderId)}/p/${encodeURIComponent(profileId)}/start?${query.toString()}`
    : `/api/v1/profile/start?automation=true&profileId=${encodeURIComponent(profileId)}&puppeteer=true`;

  const result = await requestMultiloginLauncher(token, path, { launcherUrl }, request);

  // MLX format: { status: "OK", data: { port: 49152 } } hoặc { port: 49152 }
  const port = result?.data?.port || result?.port;
  if (port) {
    return `http://127.0.0.1:${port}`;
  }

  // ML6 format: { status: "OK", value: "ws://127.0.0.1:xxxxx/..." } hoặc "127.0.0.1:xxxxx"
  const val = result?.value || result?.data?.wsUrl;
  if (typeof val === 'string' && val.length > 0) {
    if (val.startsWith('ws://') || val.startsWith('wss://') || val.startsWith('http://') || val.startsWith('https://')) {
      return val;
    }
    return `http://${val}`;
  }

  throw new Error(`Multilogin không trả về debug port hoặc CDP URL: ${JSON.stringify(result)}`);
}
