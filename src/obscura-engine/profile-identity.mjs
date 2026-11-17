/**
 * Rút phiên bản trình duyệt và fingerprint thiết bị để tránh lặp lại phiên vừa đóng.
 * @param {object} profile Profile native đã sinh.
 * @return {{browserVersion: string, deviceFingerprint: string}} Metadata thuần, không có dữ liệu duyệt web.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
export function getObscuraProfileIdentity(profile) {
  return {
    browserVersion: profile.chrome_version || profile.user_agent.match(/Version\/([^ ]+)/)?.[1] || '',
    deviceFingerprint: JSON.stringify([profile.platform, profile.screen, profile.webgl,
      profile.hardware_concurrency, profile.device_memory, profile.max_touch_points]),
  };
}
