import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { saveSavedDeviceProfiles } from './save-saved-device-profiles.mjs';

/**
 * Đọc các profile thiết bị được chọn trong Settings và lưu làm cấu hình xoay vòng.
 *
 * @param {object} settings Cấu hình có thể gồm Windows, Mac, Linux và Android.
 * @return {string[]|null} ID profile đã chọn hoặc null nếu request không có các trường thiết bị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function syncDeviceProfilesFromSettings(settings) {
  const settingKeys = ['Windows', 'Mac', 'Linux', 'Android', 'iPhone', 'iPad'];
  if (!settingKeys.some(key => Object.hasOwn(settings, key))) return null;
  const selectedProfiles = [settings.Windows && 'windows', settings.Mac && 'macos', settings.Linux && 'linux', settings.Android && 'android', settings.iPhone && 'ios', settings.iPad && 'ipad'].filter(Boolean);
  autoRefill.deviceProfiles = selectedProfiles.length > 0 ? selectedProfiles : ['windows'];
  void saveSavedDeviceProfiles();
  return autoRefill.deviceProfiles;
}
