import { execSync } from 'node:child_process';
import { findTailscaleBin } from './find-tailscale-bin.mjs';

/**
 * Kiểm tra và kích hoạt Tailscale Funnel để có URL cố định vĩnh viễn (không đổi mỗi lần build).
 * @param {number} port
 * @returns {string|null}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getTailscaleFunnel(port = 3211) {
  const bin = findTailscaleBin();
  if (!bin) return null;

  // 1. Kiểm tra trạng thái hiện tại
  try {
    const raw = execSync(`${bin} funnel status --json`, {
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString();
    const data = JSON.parse(raw);
    if (data?.AllowFunnel) {
      for (const [key, allowed] of Object.entries(data.AllowFunnel)) {
        if (allowed) {
          const host = key.split(':')[0];
          if (host) return `https://${host}`;
        }
      }
    }
  } catch {}

  // 2. Thử kích hoạt funnel nếu chưa bật
  try {
    execSync(`${bin} funnel --bg ${port}`, {
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const raw = execSync(`${bin} funnel status --json`, {
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString();
    const data = JSON.parse(raw);
    if (data?.AllowFunnel) {
      for (const [key, allowed] of Object.entries(data.AllowFunnel)) {
        if (allowed) {
          const host = key.split(':')[0];
          if (host) return `https://${host}`;
        }
      }
    }
  } catch {}
  return null;
}
export { getTailscaleFunnel };
