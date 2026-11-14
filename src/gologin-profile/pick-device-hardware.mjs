import { randomInt } from 'node:crypto';
import { createDeviceVariant } from '../stealth/create-device-variant.mjs';
import { DEVICE_PROFILES } from '../runtime/constants/device-profiles.mjs';
import { getGoLoginDeviceSettings } from './get-device-settings.mjs';

// Khung nhìn CSS các dòng iPad phổ biến (đều @2x): iPad 10/Air 11, Pro 11, Air/Pro 13, mini.
const IPAD_SCREENS = [{ width: 820, height: 1180 }, { width: 834, height: 1194 }, { width: 1024, height: 1366 }, { width: 744, height: 1133 }];

/**
 * Chọn phần cứng riêng cho mỗi profile để các phiên cùng loại thiết bị không trùng GPU/CPU/RAM/màn hình.
 * Máy tính lấy fingerprint thật ngẫu nhiên từ GoLogin. Android/iPhone/iPad dùng biến thể model + GPU + màn hình + phiên bản OS
 * khớp nhau (fingerprint Android của GoLogin có model rác và Orbita không tự báo phiên bản Android/model).
 * @param {string} token API token GoLogin.
 * @param {string} deviceProfile Khoá thiết bị GoLogin (windows, macos-arm, android, ios...).
 * @param {typeof fetch} [request=fetch] Hàm gọi API, thay bằng mock khi test.
 * @return {Promise<{fingerprint?: object, deviceVariant?: object}|null>} Phần cứng đã chọn; null khi GoLogin lỗi (dùng cấu hình tĩnh).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function pickGoLoginDeviceHardware(token, deviceProfile, request = fetch) {
  const settings = getGoLoginDeviceSettings(deviceProfile);
  if (settings.profile.isMobile) {
    const deviceVariant = createDeviceVariant(deviceProfile, DEVICE_PROFILES[deviceProfile], randomInt(1, 2 ** 31));
    if (deviceProfile === 'ipad') {
      const screen = IPAD_SCREENS[randomInt(IPAD_SCREENS.length)];
      deviceVariant.viewport = { ...screen };
      deviceVariant.screen = { ...deviceVariant.screen, ...screen };
    }
    return { deviceVariant };
  }
  const query = `os=${settings.os}${deviceProfile === 'macos-arm' ? '&isM1=true' : ''}`;
  const response = await request(`https://api.gologin.com/browser/fingerprint?${query}`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000)
  }).catch(() => null);
  const fingerprint = response?.ok ? await response.json().catch(() => null) : null;
  return fingerprint?.navigator?.resolution && fingerprint.webGLMetadata ? { fingerprint } : null;
}
