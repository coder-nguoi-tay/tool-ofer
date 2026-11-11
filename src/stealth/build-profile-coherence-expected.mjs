/**
 * Xây dựng giá trị fingerprint kỳ vọng dựa trên cấu hình thiết bị và anti-fingerprint.
 *
 * @param {object} dp Cấu hình profile thiết bị (DEVICE_PROFILES hoặc createDeviceVariant).
 * @param {object} antiFingerprint Cấu hình anti-fingerprint từ UI/Settings.
 * @param {object} options Các tuỳ chọn bổ sung { timezoneId, languages, effectiveBuild }.
 * @return {object} Đối tượng chứa các giá trị kỳ vọng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function buildProfileCoherenceExpected(dp, antiFingerprint = {}, options = {}) {
  const {
    timezoneId,
    languages
  } = options;
  const spoof = dp?.spoof || {};
  const platform = dp?.platform || spoof.platform || null;
  let expectedUaContains = null;
  if (dp?.isMobile) {
    expectedUaContains = dp?.uaData?.model || 'Mobile';
  } else if (platform === 'MacIntel') {
    expectedUaContains = 'Macintosh';
  } else if (platform === 'Win32') {
    expectedUaContains = 'Windows';
  } else if (platform === 'Linux x86_64') {
    expectedUaContains = 'Linux';
  }
  const isIos = spoof.uaPlatform === 'iOS';
  const isMobile = Boolean(dp?.isMobile);
  return {
    platform,
    uaPlatform: spoof.uaPlatform || dp?.uaData?.platform || null,
    userAgentContains: expectedUaContains,
    webdriver: false,
    hardwareConcurrency: spoof.hardwareConcurrency || null,
    deviceMemory: spoof.deviceMemory ?? null,
    maxTouchPoints: typeof spoof.maxTouchPoints === 'number' ? spoof.maxTouchPoints : isMobile ? 5 : 0,
    devicePixelRatio: dp?.deviceScaleFactor || spoof.dpr || null,
    webglVendor: antiFingerprint.webgl ? spoof.webglVendor || null : null,
    webglRenderer: antiFingerprint.webgl ? spoof.webglRenderer || null : null,
    timezone: timezoneId || null,
    languages: Array.isArray(languages) && languages.length > 0 ? languages : ['en-US', 'en'],
    isMobile,
    hasChromeObject: !isIos,
    pdfViewerEnabled: !isMobile && !isIos,
    hasPlugins: !isMobile && !isIos,
    notificationPermission: 'default',
    notificationQueryState: 'prompt'
  };
}
export { buildProfileCoherenceExpected };
