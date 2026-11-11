import { existsSync } from 'node:fs';

/**
 * Tìm binary tailscale trên macOS.
 * @return {*} Kết quả xử lý find tailscale bin.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function findTailscaleBin() {
  const common = ['/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale', 'tailscale'];
  for (const p of common) {
    if (p === 'tailscale' || existsSync(p)) return p;
  }
  return null;
}
export { findTailscaleBin };
