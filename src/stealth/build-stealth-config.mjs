/**
 * Cấu hình truyền vào stealthInitScript cho một phiên.
 *
 * @param {object} deviceProfile Một phần tử của DEVICE_PROFILES.
 * @param {object} antiFingerprint Tuỳ chọn chống fingerprint của người dùng.
 * @param {number} seed Hạt nhiễu riêng của phiên.
 * @return {object} Cấu hình thuần JSON.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function buildStealthConfig(deviceProfile, antiFingerprint = {}, seed = 1, userAgent = '') {
  const spoof = deviceProfile.spoof || {};
  const ua = userAgent || (typeof deviceProfile.ua === 'function' ? deviceProfile.ua('130.0.0.0') : '');
  const uaData = deviceProfile.uaData ? {
    ...deviceProfile.uaData
  } : null;
  if (uaData && !uaData.uaFullVersion && uaData.fullVersion) {
    uaData.uaFullVersion = uaData.fullVersion;
  }
  return {
    userAgent: ua,
    platform: spoof.platform || deviceProfile.platform,
    vendor: spoof.vendor,
    maxTouchPoints: spoof.maxTouchPoints,
    hardwareConcurrency: spoof.hardwareConcurrency ?? null,
    deviceMemory: spoof.deviceMemory ?? null,
    webkitOnly: spoof.uaPlatform === 'iOS',
    isMobile: Boolean(deviceProfile.isMobile),
    uaData,
    webglVendor: spoof.webglVendor,
    webglRenderer: spoof.webglRenderer,
    webglParams: spoof.webglParams ?? null,
    workerInjection: Boolean(antiFingerprint.workerInjection),
    screen: deviceProfile.screen && !deviceProfile.isMobile ? {
      availTop: deviceProfile.screen.availTop ?? 0,
      availHeight: deviceProfile.screen.availHeight ?? deviceProfile.screen.height,
      frameHeight: deviceProfile.screen.frameHeight ?? 85
    } : null,
    // Mỗi mục trong Settings điều khiển riêng lớp nhiễu tương ứng.
    noise: {
      canvas: Boolean(antiFingerprint.canvas),
      clientRects: Boolean(antiFingerprint.clientRects),
      webgl: Boolean(antiFingerprint.webgl),
      fonts: Boolean(antiFingerprint.fonts),
      audio: true
    },
    seed: Number(seed) >>> 0 || 1
  };
}
export { buildStealthConfig };
