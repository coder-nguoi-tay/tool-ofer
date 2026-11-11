/**
 * Chuyển cấu hình của một slot thành profile SunBrowser có proxy và fingerprint riêng.
 *
 * @param {object} options Proxy, hệ điều hành, bản SunBrowser đã cài và fingerprint của slot.
 * @return {object} Payload tạo profile AdsPower V2.
 * @throws {Error} Khi thiếu kernel đã cài hoặc giao thức proxy không được AdsPower hỗ trợ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function buildAdsPowerProfileRequest({
  slot,
  proxy = null,
  exitIp = '',
  websiteUrl = '',
  antiFingerprint = {},
  deviceProfile = 'windows',
  userAgent = '',
  browserVersion,
  resolution = '1920x1080'
}) {
  if (!browserVersion) throw new Error('Thiếu phiên bản SunBrowser đã cài cho profile AdsPower.');
  const osLabel = {
    windows: 'Windows 10',
    macos: 'Mac OS X 14',
    linux: 'Linux',
    android: 'Android 13',
    ios: 'iOS 17',
    ipad: 'iOS 17'
  }[deviceProfile] || 'Windows 10';
  const osShort = {
    windows: 'Win 10',
    macos: 'macOS',
    linux: 'Linux',
    android: 'Android',
    ios: 'iPhone',
    ipad: 'iPad'
  }[deviceProfile] || 'Win 10';
  const fingerprint = {
    browser_kernel_config: {
      type: 'chrome',
      version: String(browserVersion)
    },
    automatic_timezone: '1',
    language_switch: '1',
    location_switch: '1',
    location: antiFingerprint.apiFakeIP ? 'allow' : 'ask',
    webrtc: antiFingerprint.webrtc && proxy?.server ? 'proxy' : 'disabled',
    canvas: antiFingerprint.canvas !== false ? '0' : '1',
    webgl: antiFingerprint.webgl !== false ? '0' : '1',
    webgl_image: antiFingerprint.webgl !== false ? '0' : '1',
    client_rects: antiFingerprint.clientRects !== false ? '0' : '1',
    audio: '0',
    media_devices: '0',
    fonts: antiFingerprint.fonts !== false ? ['all'] : ['default'],
    screen_resolution: resolution ? resolution.replace('x', '_') : '1920_1080',
    device_memory: '8',
    hardware_concurrency: '8'
  };
  const defaultUa = deviceProfile === 'windows' ? `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion}.0.0.0 Safari/537.36` : deviceProfile === 'macos' ? `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion}.0.0.0 Safari/537.36` : `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion}.0.0.0 Safari/537.36`;
  const targetUa = userAgent || defaultUa;
  fingerprint.ua = targetUa;
  fingerprint.random_ua = {
    ua_browser: ['chrome'],
    ua_version: [String(browserVersion)],
    ua_system_version: deviceProfile === 'windows' ? ['Windows 10'] : [osLabel]
  };
  const userProxyConfig = {
    proxy_soft: 'no_proxy'
  };
  let proxyHost = '';
  if (proxy?.server) {
    const address = new URL(proxy.server);
    const protocol = address.protocol.slice(0, -1).toLowerCase();
    if (!['http', 'https', 'socks5'].includes(protocol) || !address.hostname || !address.port) {
      throw new Error(`AdsPower không hỗ trợ proxy ${proxy.server}.`);
    }
    proxyHost = address.hostname;
    Object.assign(userProxyConfig, {
      proxy_soft: 'other',
      proxy_type: protocol,
      proxy_host: address.hostname,
      proxy_port: address.port,
      proxy_user: proxy.username || decodeURIComponent(address.username),
      proxy_password: proxy.password || decodeURIComponent(address.password)
    });
  }
  const resolvedIp = exitIp || proxyHost || (slot ? `Slot ${slot}` : 'AutoLeadPC');
  const payload = {
    name: `Slot ${slot || 1} • [${osShort}] Chrome ${browserVersion} • ${resolvedIp}`,
    remark: `AutoLeadPC • ${osLabel} • Chrome ${browserVersion} • ${resolvedIp}`,
    group_id: '0',
    user_proxy_config: userProxyConfig,
    fingerprint_config: fingerprint,
    ...(websiteUrl ? {
      tabs: [websiteUrl]
    } : {})
  };
  if (proxyHost) {
    payload.ip = exitIp || proxyHost;
  }
  return payload;
}
export { buildAdsPowerProfileRequest };
