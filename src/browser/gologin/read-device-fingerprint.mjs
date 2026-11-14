/**
 * Đọc OS profile từ SDK và fingerprint thực tế từ Orbita sau khi cấu hình thiết bị hoàn tất.
 * @param {object} session Phiên GoLogin có trang chính và kết nối CDP.
 * @param {object} gl Instance GoLogin đã nạp profile từ API.
 * @return {Promise<object>} Dữ liệu an toàn để lưu log, không chứa token hoặc proxy.
 */
export async function readGoLoginDeviceFingerprint(session, gl) {
  // Link click toffers còn chuyển hướng bằng JS sau domcontentloaded: evaluate trúng lúc chuyển trang thì đợi trang mới rồi đọc lại.
  const readNavigator = () => session.mainPage.evaluate(async () => {
    const data = navigator.userAgentData;
    let hints = null;
    if (data?.getHighEntropyValues) {
      hints = await Promise.race([
        data.getHighEntropyValues(['platform', 'platformVersion', 'mobile']).catch(() => null),
        new Promise(resolve => setTimeout(() => resolve(null), 1500))
      ]);
    }
    return {
      platform: navigator.platform || null,
      userAgent: navigator.userAgent || null,
      touchPoints: navigator.maxTouchPoints ?? null,
      uaPlatform: hints?.platform || data?.platform || null,
      uaPlatformVersion: hints?.platformVersion || null,
      uaMobile: hints?.mobile ?? data?.mobile ?? null
    };
  });
  let navigatorInfo;
  for (let attempt = 1; ; attempt++) {
    try {
      navigatorInfo = await readNavigator();
      break;
    } catch (error) {
      if (attempt >= 3 || !/context was destroyed|navigat/i.test(error.message)) throw error;
      await session.mainPage.waitForLoadState('domcontentloaded').catch(() => {});
    }
  }
  return {
    profileOs: gl?.profileOs || null,
    orbitaVersion: session._cdpBrowser?.version?.() || null,
    platform: navigatorInfo?.platform || null,
    userAgent: navigatorInfo?.userAgent || null,
    touchPoints: navigatorInfo?.touchPoints ?? null,
    uaPlatform: navigatorInfo?.uaPlatform || null,
    uaPlatformVersion: navigatorInfo?.uaPlatformVersion || null,
    uaMobile: navigatorInfo?.uaMobile ?? null
  };
}
