import { DEFAULT_LAUNCHER_ADDRESS } from './state/launcher-address.mjs';
import { requestMultiloginLauncher } from './request-multilogin-launcher.mjs';

/**
 * Dừng profile Multilogin đang chạy.
 *
 * @param {object} options Các tham số (token, folderId, profileId, launcherUrl).
 * @param {typeof fetch} [request=fetch] Hàm fetch để gửi request hoặc mock test.
 * @return {Promise<void>} Hoàn tất khi launcher xác nhận dừng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export async function stopMultiloginProfile({
  token = '',
  folderId = '',
  profileId,
  launcherUrl = DEFAULT_LAUNCHER_ADDRESS
} = {}, request = fetch) {
  if (!profileId) return;
  const path = folderId
    ? `/api/v1/profile/stop/p/${encodeURIComponent(folderId)}/${encodeURIComponent(profileId)}`
    : `/api/v1/profile/stop?profileId=${encodeURIComponent(profileId)}`;

  try {
    await requestMultiloginLauncher(token, path, { launcherUrl }, request);
  } catch (err) {
    const msg = String(err.message || '').toLowerCase();
    // Bỏ qua nếu profile thực tế đã tắt hoặc không chạy
    if (msg.includes('not running') || msg.includes('not found') || msg.includes('inactive')) {
      return;
    }
    console.warn(`[Multilogin] Cảnh báo khi dừng profile ${profileId}: ${err.message}`);
  }
}
