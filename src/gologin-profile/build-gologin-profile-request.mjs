import { getGoLoginDeviceSettings } from './get-device-settings.mjs';

/**
 * Dựng profile Orbita cho đủ sáu lựa chọn hệ điều hành, với iPhone/iPad giả lập trên nền Mac.
 *
 * @param {object} options Slot, proxy, exitIp, deviceProfile, browserVersion, resolution, websiteUrl; hardware là kết quả
 *   pickGoLoginDeviceHardware (fingerprint GoLogin cho máy tính, biến thể model cho Android/iPhone/iPad).
 * @return {object} Payload tạo profile GoLogin.
 * @throws {Error} Khi thiết bị không có trong danh mục core.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export function buildGoLoginProfileRequest({
  slot = 1,
  proxy = null,
  exitIp = '',
  deviceProfile = 'windows',
  userAgent = '',
  browserVersion = '150',
  resolution,
  hardware = null
}) {
  const device = getGoLoginDeviceSettings(deviceProfile, browserVersion);
  const effectiveResolution = resolution ? resolution.replace('_', 'x') : `${device.profile.screen.width}x${device.profile.screen.height}`;
  const [screenWidth, screenHeight] = effectiveResolution.split('x').map(Number);
  const versionNum = String(browserVersion || '150').replace(/^(\d+).*/, '$1');
  // UA mang đúng số build Orbita (vd. 152.0.7977.82) như fingerprint GoLogin tự cấp; chỉ có số chính thì dùng dạng .0.0.0.
  const fullVersion = String(browserVersion || '150').includes('.') ? String(browserVersion) : `${versionNum}.0.0.0`;

  const os = device.os;

  const osShort = device.label;

  let defaultUa;
  let platform;
  let webglVendor;
  let webglRenderer;

  if (device.appleMobile) {
    defaultUa = device.userAgent;
    platform = device.platform;
    webglVendor = device.webglVendor;
    webglRenderer = device.webglRenderer;
  } else if (device.os === 'mac') {
    defaultUa = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${fullVersion} Safari/537.36`;
    platform = 'MacIntel';
    webglVendor = deviceProfile === 'macos-intel' ? device.webglVendor : 'Google Inc. (Apple)';
    webglRenderer = deviceProfile === 'macos-intel' ? device.webglRenderer : 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)';
  } else if (deviceProfile === 'linux') {
    defaultUa = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${fullVersion} Safari/537.36`;
    platform = 'Linux x86_64';
    webglVendor = 'Google Inc. (Intel)';
    webglRenderer = 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)';
  } else if (deviceProfile === 'android') {
    // UA đầy đủ như fingerprint GoLogin: Orbita tự rút gọn thành "Android 10; K"/X.0.0.0 và giữ số build ở Client Hints.
    defaultUa = `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${fullVersion} Mobile Safari/537.36`;
    platform = 'Linux armv8l';
    webglVendor = 'ARM';
    webglRenderer = 'Mali-G715';
  } else {
    // Windows
    defaultUa = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${fullVersion} Safari/537.36`;
    platform = 'Win32';
    webglVendor = 'Google Inc. (NVIDIA)';
    webglRenderer = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';
  }

  const deviceVariant = hardware?.deviceVariant;
  const fingerprint = hardware?.fingerprint;
  const finalUa = userAgent || (deviceVariant ? deviceVariant.ua(fullVersion) : defaultUa);

  const proxyConfig = {
    mode: 'none'
  };

  if (proxy?.server) {
    try {
      const address = new URL(proxy.server);
      const protocol = address.protocol.slice(0, -1).toLowerCase();
      if (['http', 'https', 'socks5', 'socks4'].includes(protocol) && address.hostname && address.port) {
        proxyConfig.mode = protocol === 'https' ? 'http' : protocol;
        proxyConfig.host = address.hostname;
        proxyConfig.port = Number(address.port);
        const username = proxy.username || decodeURIComponent(address.username || '');
        const password = proxy.password || decodeURIComponent(address.password || '');
        if (username) proxyConfig.username = username;
        if (password) proxyConfig.password = password;
      }
    } catch {
      // Bỏ qua lỗi URL proxy không hợp lệ
    }
  }


  const request = {
    // Chưa ghi IP lúc tạo: IP kiểm proxy trước có thể khác IP Orbita thật sự dùng. Xác minh xong mới đổi tên thành IP app hiển thị.
    name: buildGoLoginProfileName({ slot, osLabel: osShort, versionNum }),
    notes: `AutoLeadPC Mac • ${osShort} • Chrome ${versionNum}`,
    os, osSpec: device.osSpec,
    // Không mở trang Google khởi động: tiết kiệm ~170 KB/phiên qua proxy; app tự điều hướng tab đầu tới offer.
    startUrl: 'about:blank',
    ...(device.profile.isMobile ? {
      screenWidth, screenHeight, devicePixelRatio: device.devicePixelRatio
    } : {}),
    navigator: {
      userAgent: finalUa,
      resolution: effectiveResolution,
      language: 'en-US,en;q=0.9',
      platform,
      hardwareConcurrency: device.profile.isMobile ? device.hardwareConcurrency : 16,
      deviceMemory: 8,
      maxTouchPoints: device.maxTouchPoints
    },
    webGLMetadata: {
      mode: 'mask',
      vendor: webglVendor,
      renderer: webglRenderer
    },
    proxy: proxyConfig
  };
  if (deviceVariant) {
    // Điện thoại/máy tính bảng: model, GPU, màn hình và phiên bản OS riêng cho từng profile, khớp nhau.
    const { width, height } = deviceVariant.viewport;
    Object.assign(request, { screenWidth: width, screenHeight: height, devicePixelRatio: deviceVariant.deviceScaleFactor });
    Object.assign(request.navigator, { resolution: `${width}x${height}`, hardwareConcurrency: deviceVariant.spoof.hardwareConcurrency,
      ...(deviceVariant.spoof.deviceMemory ? { deviceMemory: deviceVariant.spoof.deviceMemory } : {}) });
    if (!device.appleMobile) Object.assign(request.webGLMetadata, { vendor: deviceVariant.spoof.webglVendor, renderer: deviceVariant.spoof.webglRenderer });
  }
  if (fingerprint) {
    // Máy tính/Android: tổ hợp phần cứng thật do GoLogin sinh (màn hình, GPU, WebGL, CPU, RAM, font); chỉ giữ UA/ngôn ngữ của app.
    const [fingerprintWidth, fingerprintHeight] = fingerprint.navigator.resolution.split('x').map(Number);
    Object.assign(request, {
      navigator: { ...fingerprint.navigator, userAgent: finalUa, language: 'en-US,en;q=0.9' },
      webGLMetadata: { mode: 'mask', vendor: fingerprint.webGLMetadata.vendor, renderer: fingerprint.webGLMetadata.renderer },
      ...(fingerprint.webglParams ? { webglParams: fingerprint.webglParams } : {}),
      ...(Array.isArray(fingerprint.fonts) ? { fonts: { families: fingerprint.fonts } } : {}),
      ...(fingerprint.mediaDevices ? { mediaDevices: fingerprint.mediaDevices } : {}),
      devicePixelRatio: fingerprint.devicePixelRatio,
      ...(device.profile.isMobile ? { screenWidth: fingerprintWidth, screenHeight: fingerprintHeight } : {})
    });
  }
  return request;
}

/**
 * Tên profile GoLogin hiển thị (danh sách GoLogin, thanh Orbita): IP là đúng IP app đã xác minh trong Orbita.
 * @param {{slot: number, osLabel: string, versionNum: string|number, ip?: string}} options Slot, nhãn hệ điều hành, bản Chrome, IP.
 * @return {string} Tên profile; chưa có IP thì ghi "đang xác minh IP".
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export function buildGoLoginProfileName({ slot, osLabel, versionNum, ip = '' }) {
  return `Slot ${slot} • [${osLabel}] Chrome ${versionNum} • ${ip || 'đang xác minh IP'}`;
}
