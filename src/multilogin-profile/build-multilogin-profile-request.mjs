import { formatMultiloginProxy } from './format-multilogin-proxy.mjs';

/**
 * Dựng payload tạo profile Multilogin X với nhân Mimic cho một slot.
 *
 * @param {object} options Proxy, hệ điều hành, folder ID và slot.
 * @return {object} Payload tạo profile Multilogin X.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export function buildMultiloginProfileRequest({
  slot = 1,
  proxy = null,
  exitIp = '',
  websiteUrl = '',
  folderId = '',
  deviceProfile = 'windows',
  browserVersion = '130',
  resolution = '1920x1080',
  antiFingerprint = {}
} = {}) {
  const os = deviceProfile === 'macos' ? 'mac' : deviceProfile === 'linux' ? 'lin' : 'win';
  let resolvedIp = exitIp;
  if (!resolvedIp && proxy?.server) {
    try {
      resolvedIp = new URL(proxy.server).hostname;
    } catch {
      resolvedIp = `Slot ${slot}`;
    }
  }
  if (!resolvedIp) resolvedIp = `Slot ${slot}`;

  const proxyConfig = formatMultiloginProxy(proxy);

  return {
    name: `Slot ${slot} • Mimic • ${resolvedIp}`,
    notes: `AutoLeadPC • Mimic • ${resolvedIp}`,
    browser_type: 'mimic',
    os,
    ...(folderId ? { folder_id: folderId } : {}),
    parameters: {
      proxy: proxyConfig,
      fingerprint: {
        screen: {
          resolution: resolution ? resolution.replace('x', '_') : '1920_1080'
        },
        webrtc: {
          mode: antiFingerprint.webrtc && proxy?.server ? 'real' : 'disabled'
        },
        canvas: {
          mode: antiFingerprint.canvas !== false ? 'noise' : 'real'
        },
        webgl: {
          mode: antiFingerprint.webgl !== false ? 'noise' : 'real'
        }
      }
    }
  };
}
