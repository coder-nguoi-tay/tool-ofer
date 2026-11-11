import { TUNNEL_URL_FILE } from './state/tunnel-url-file.mjs';
import { existsSync } from 'node:fs';
import { findCloudflaredBin } from './find-cloudflared-bin.mjs';
import { getTailscaleFunnel } from './get-tailscale-funnel.mjs';
import { moduleState } from './state/module-state.mjs';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { unlinkSync } from 'node:fs';
import { writeFileSync } from 'node:fs';

/**
 * Khởi động Tunnel trỏ tới port nội bộ.
 * Ưu tiên số 1: Tailscale Funnel (URL cố định vĩnh viễn, không đổi mỗi lần build app).
 * Dự phòng số 2: Cloudflare Tunnel.
 * @param {number} port - Port local cần tunnel (mặc định 3211)
 * @param {number} timeoutMs - Thời gian chờ tối đa lấy URL (mặc định 20s)
 * @returns {Promise<{ ok: boolean, url?: string, error?: string, provider?: string }>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function startTunnel(port = 3211, timeoutMs = 20000) {
  // 1. Ưu tiên kiểm tra Tailscale Funnel (URL cố định vĩnh viễn)
  try {
    const tsUrl = getTailscaleFunnel(port);
    if (tsUrl) {
      moduleState.currentTunnelUrl = tsUrl;
      try {
        writeFileSync(TUNNEL_URL_FILE, tsUrl, 'utf8');
      } catch {}
      console.log(`[Tunnel] 🌟 Đang sử dụng Tailscale Funnel URL CỐ ĐỊNH: ${tsUrl}`);
      return {
        ok: true,
        url: tsUrl,
        provider: 'tailscale',
        permanent: true
      };
    }
  } catch (err) {
    console.warn(`[Tunnel] Tailscale Funnel không sẵn sàng: ${err.message}, chuyển sang Cloudflare Tunnel...`);
  }

  // 2. Kiểm tra tunnel URL hiện có trong bộ nhớ
  if (moduleState.currentTunnelUrl) {
    return {
      ok: true,
      url: moduleState.currentTunnelUrl,
      cached: true
    };
  }

  // 2. Kiểm tra xem có tunnel nền nào đang chạy từ trước (tái sử dụng URL cũ)
  if (existsSync(TUNNEL_URL_FILE)) {
    try {
      const savedUrl = readFileSync(TUNNEL_URL_FILE, 'utf8').trim();
      if (savedUrl.startsWith('https://')) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        try {
          const checkRes = await fetch(`${savedUrl}/tunnel`, {
            signal: controller.signal
          });
          clearTimeout(timeout);
          if (checkRes.ok) {
            moduleState.currentTunnelUrl = savedUrl;
            console.log(`[Tunnel] ✅ Tái sử dụng tunnel cố định đang hoạt động: ${savedUrl}`);
            return {
              ok: true,
              url: savedUrl,
              reused: true
            };
          }
        } catch {}
      }
    } catch {}
  }
  if (moduleState.isStarting && moduleState.startPromise) {
    return moduleState.startPromise;
  }
  moduleState.isStarting = true;
  moduleState.startPromise = new Promise(resolve => {
    try {
      const bin = findCloudflaredBin();
      console.log(`[Tunnel] Khởi động cloudflared tunnel trỏ tới port ${port}...`);
      const proc = spawn(bin, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      proc.unref();
      moduleState.tunnelProcess = proc;
      moduleState.tunnelStartTime = Date.now();
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          moduleState.isStarting = false;
          resolve({
            ok: false,
            error: 'Hết thời gian chờ tạo URL tunnel (timeout 20s).'
          });
        }
      }, timeoutMs);
      const handleOutput = chunk => {
        const text = chunk.toString();
        // Tìm pattern https://xxx.trycloudflare.com
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !resolved) {
          const url = match[0];
          moduleState.currentTunnelUrl = url;
          resolved = true;
          clearTimeout(timer);
          moduleState.isStarting = false;
          console.log(`[Tunnel] ✅ Tunnel sẵn sàng: ${url}`);
          try {
            writeFileSync(TUNNEL_URL_FILE, url, 'utf8');
          } catch {}
          resolve({
            ok: true,
            url
          });
        }
      };
      proc.stdout.on('data', handleOutput);
      proc.stderr.on('data', handleOutput);
      proc.on('error', err => {
        console.error(`[Tunnel] Lỗi spawn cloudflared:`, err.message);
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          moduleState.isStarting = false;
          resolve({
            ok: false,
            error: err.message
          });
        }
      });
      proc.on('exit', (code, signal) => {
        console.log(`[Tunnel] cloudflared thoát với mã code=${code}, signal=${signal}`);
        moduleState.tunnelProcess = null;
        moduleState.currentTunnelUrl = null;
        try {
          if (existsSync(TUNNEL_URL_FILE)) unlinkSync(TUNNEL_URL_FILE);
        } catch {}
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          moduleState.isStarting = false;
          resolve({
            ok: false,
            error: `cloudflared thoát sớm (code=${code})`
          });
        }
      });
    } catch (err) {
      moduleState.isStarting = false;
      resolve({
        ok: false,
        error: err.message
      });
    }
  });
  return moduleState.startPromise;
}
export { startTunnel };
