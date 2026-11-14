/**
 * Chuẩn hóa cấu hình proxy của AutoLeadPC sang định dạng proxy của Multilogin X.
 *
 * @param {object|null} proxy Cấu hình proxy gồm server, username, password.
 * @return {object} Object proxy phù hợp với API Multilogin.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export function formatMultiloginProxy(proxy) {
  if (!proxy?.server) return { mode: 'none' };
  try {
    const url = new URL(proxy.server);
    const mode = url.protocol.replace(':', '').toLowerCase();
    return {
      mode: ['http', 'https', 'socks4', 'socks5'].includes(mode) ? mode : 'socks5',
      host: url.hostname,
      port: Number(url.port) || 1080,
      username: proxy.username || decodeURIComponent(url.username || ''),
      password: proxy.password || decodeURIComponent(url.password || '')
    };
  } catch {
    return { mode: 'none' };
  }
}
