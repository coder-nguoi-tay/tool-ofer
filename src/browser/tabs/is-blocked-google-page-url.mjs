export const googleRootDomains = ['google.com'];

/**
 * Nhận diện trang Google cần chặn ở cấp tab, bao gồm mọi subdomain của tên miền gốc.
 * @param {string} value URL tuyệt đối của tab hoặc đích điều hướng.
 * @return {boolean} True chỉ với URL HTTP(S) thuộc đúng tên miền Google.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export function isBlockedGooglePageUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const hostname = url.hostname.replace(/\.$/, '');
    return googleRootDomains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch { return false; }
}
