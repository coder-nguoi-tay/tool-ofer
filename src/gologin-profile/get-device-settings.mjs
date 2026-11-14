import { GOLOGIN_DEVICE_CHOICES } from './device-choices.mjs';
import { DEVICE_PROFILES } from '../runtime/constants/device-profiles.mjs';

/**
 * Ánh xạ loại profile GoLogin vào OS/osSpec chính thức và cấu hình core tương ứng.
 * @param {string} deviceProfile Khóa thiết bị từ giao diện.
 * @param {string} browserVersion Phiên bản Chrome dùng trong UA.
 * @return {object} Hệ điều hành profile nền và thông số UA/cảm ứng/màn hình dùng chung.
 * @throws {Error} Khi khóa thiết bị không có trong danh mục core.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export function getGoLoginDeviceSettings(deviceProfile, browserVersion = '150') {
  const choice = GOLOGIN_DEVICE_CHOICES.find(item => item.key === deviceProfile);
  const base = DEVICE_PROFILES[choice?.base || deviceProfile];
  const profile = base && deviceProfile === 'macos-intel' ? {
    ...base, spoof: { ...base.spoof, webglVendor: 'Intel Inc.', webglRenderer: 'Intel Iris OpenGL Engine' },
    uaData: { ...base.uaData, architecture: 'x86' }
  } : base;
  if (!profile) throw new Error(`Thiết bị GoLogin không hợp lệ: ${deviceProfile}`);
  const appleMobile = deviceProfile === 'ios' || deviceProfile === 'ipad';
  const os = choice?.os || { windows: 'win', macos: 'mac', linux: 'lin', android: 'android', ios: 'mac', ipad: 'mac' }[deviceProfile];
  const version = String(browserVersion).includes('.') ? String(browserVersion) : `${browserVersion}.0.0.0`;
  return {
    os, osSpec: choice?.osSpec || '', label: choice?.label || profile.label, profile, appleMobile,
    userAgent: profile.ua(version),
    platform: profile.spoof.platform,
    maxTouchPoints: profile.hasTouch ? profile.spoof.maxTouchPoints : 0,
    devicePixelRatio: profile.deviceScaleFactor,
    hardwareConcurrency: profile.spoof.hardwareConcurrency,
    webglVendor: profile.spoof.webglVendor,
    webglRenderer: profile.spoof.webglRenderer
  };
}
