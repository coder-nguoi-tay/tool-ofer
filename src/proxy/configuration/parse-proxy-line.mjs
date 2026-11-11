import { withCredentials } from './with-credentials.mjs';

/**
 * Phân tích một dòng proxy thành cấu hình Playwright.
 *
 * Nhận các format của bản PC (Config/Proxy): scheme://[user:pass@]host:port,
 * host:port, host:port:user:pass, host:port|user|pass và host:port|phút|reset-url.
 * Từ chối rõ ràng SSH proxy và API key provider vì bản Mac không dựng tunnel và
 * không gọi API provider.
 *
 * @param {string} line Một URL proxy hoặc host:port|username|password.
 * @param {number} lineNumber Số dòng để hiển thị lỗi nhập liệu.
 * @param {string} proxyType Scheme mặc định cho dòng chỉ có host:port.
 * @return {{server: string, username?: string, password?: string}|null} Cấu hình proxy hoặc null nếu dòng trống.
 * @throws {Error} Khi proxy không đúng định dạng được hỗ trợ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function parseProxyLine(line, lineNumber, proxyType = 'socks5') {
  const value = line.trim();
  if (!value || value.startsWith('#')) return null;

  // Phải neo scheme ở đầu dòng: format host:port|phút|reset-url cũng chứa "://".
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    const proxyUrl = new URL(value);
    if (!['socks5:', 'http:', 'https:'].includes(proxyUrl.protocol) || !proxyUrl.hostname || !proxyUrl.port) {
      throw new Error(`Dòng ${lineNumber}: URL proxy phải dùng socks5://, http:// hoặc https:// và có cổng.`);
    }
    return withCredentials(`${proxyUrl.protocol === 'https:' ? 'http:' : proxyUrl.protocol}//${proxyUrl.hostname}:${proxyUrl.port}`, proxyUrl.username ? decodeURIComponent(proxyUrl.username) : undefined, proxyUrl.password ? decodeURIComponent(proxyUrl.password) : undefined);
  }
  const colonCredentials = value.match(/^([^:|]+):(\d{1,5}):([^:|]+):(.+)$/);
  if (colonCredentials) {
    const [, host, proxyPort, username, password] = colonCredentials;
    if (Number(proxyPort) < 1 || Number(proxyPort) > 65535) {
      throw new Error(`Dòng ${lineNumber}: port proxy phải nằm trong khoảng 1-65535.`);
    }
    return withCredentials(`${proxyType}://${host}:${proxyPort}`, username, password);
  }
  const fields = value.split('|');
  const [hostAndPort, username, ...passwordParts] = fields;
  const separator = hostAndPort.lastIndexOf(':');
  const host = hostAndPort.slice(0, separator);
  const proxyPort = hostAndPort.slice(separator + 1);
  if (separator < 1 || !/^\d{1,5}$/.test(proxyPort) || Number(proxyPort) < 1 || Number(proxyPort) > 65535) {
    if (fields.length >= 4) {
      throw new Error(`Dòng ${lineNumber}: đây là SSH proxy (host|user|pass|country) — phải tự mở tunnel ` + '(ssh -D) rồi khai báo 127.0.0.1:<port>, bản Mac không dựng tunnel.');
    }
    if (fields.length === 1) {
      throw new Error(`Dòng ${lineNumber}: "${hostAndPort}" không có cổng — IP trần thì thêm ":port", còn nếu là ` + 'API key provider (tinsoft/Socks4G) thì phải gọi API provider để lấy proxy trước.');
    }
    throw new Error(`Dòng ${lineNumber}: dùng host:port, host:port|user|pass hoặc socks5://user:pass@host:port.`);
  }
  const server = `${proxyType}://${host}:${proxyPort}`;

  // host:port|<phút>|<reset url> của proxyHung.txt: trường 2 là chu kỳ xoay, không phải username.
  if (passwordParts.length === 1 && /^\d+$/.test(username ?? '') && /^https?:\/\//.test(passwordParts[0])) {
    return {
      server,
      rotateMinutes: Number(username),
      resetUrl: passwordParts[0]
    };
  }
  const password = passwordParts.join('|');
  return withCredentials(server, username, password || undefined);
}
export { parseProxyLine };
