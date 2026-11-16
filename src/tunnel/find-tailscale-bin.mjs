import { join } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Tìm binary Tailscale theo hệ điều hành hiện tại.
 * @return {*} Kết quả xử lý find tailscale bin.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
function findTailscaleBin() {
  if (process.platform === 'win32') {
    const installed = join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Tailscale', 'tailscale.exe');
    return existsSync(installed) ? installed : 'tailscale.exe';
  }
  const common = ['/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale', 'tailscale'];
  for (const p of common) {
    if (p === 'tailscale' || existsSync(p)) return p;
  }
  return null;
}
export { findTailscaleBin };
