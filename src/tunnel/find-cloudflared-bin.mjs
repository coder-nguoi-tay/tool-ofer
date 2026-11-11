import { existsSync } from 'node:fs';

/**
 * Tìm đường dẫn thực thi của binary cloudflared trên macOS.
 * @return {*} Kết quả xử lý find cloudflared bin.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function findCloudflaredBin() {
  const commonPaths = ['/opt/homebrew/bin/cloudflared', '/usr/local/bin/cloudflared', 'cloudflared'];
  for (const p of commonPaths) {
    if (p === 'cloudflared' || existsSync(p)) return p;
  }
  return 'cloudflared';
}
export { findCloudflaredBin };
