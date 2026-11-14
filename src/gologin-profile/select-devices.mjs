import { DEFAULT_GOLOGIN_DEVICES, GOLOGIN_DEVICE_CHOICES } from './device-choices.mjs';

// Ô "Hệ điều hành" người dùng tick → các profile GoLogin cùng họ.
const DEVICE_FAMILIES_BY_OS_FLAG = {
  Windows: ['windows', 'windows11'], Mac: ['macos-intel', 'macos-arm'], Linux: ['linux'],
  Android: ['android'], iPhone: ['ios'], iPad: ['ipad']
};

/**
 * Chọn profile GoLogin theo ô Hệ điều hành người dùng tick; mục GoLogin Orbita chỉ chọn biến thể trong họ
 * (Windows 10/11, Mac Intel/ARM), họ không có biến thể nào được chọn thì dùng cả họ.
 * @param {object} body Yêu cầu Start/bù slot.
 * @param {object} config Cấu hình GoLogin đã lưu.
 * @return {string[]} Danh sách thiết bị duy nhất theo thứ tự đã chọn.
 * @throws {Error} Khi danh sách chủ động rỗng hoặc chứa profile không được hỗ trợ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export function selectGoLoginDevices(body, config = {}) {
  const requested = body.gologinDevices ?? config.devices;
  if (requested !== undefined && (!Array.isArray(requested) || requested.some(key => !GOLOGIN_DEVICE_CHOICES.some(choice => choice.key === key)))) {
    throw new Error('Chọn ít nhất một loại profile GoLogin hợp lệ trong Cài đặt.');
  }
  const families = Object.entries(DEVICE_FAMILIES_BY_OS_FLAG).filter(([flag]) => body[flag] === true).map(([, keys]) => keys);
  if (families.length) {
    return families.flatMap(keys => {
      const variants = keys.filter(key => requested?.includes(key));
      return variants.length ? variants : keys;
    });
  }
  if (requested !== undefined) {
    if (!requested.length) throw new Error('Chọn ít nhất một loại profile GoLogin hợp lệ trong Cài đặt.');
    return [...new Set(requested)];
  }
  return [...DEFAULT_GOLOGIN_DEVICES];
}
