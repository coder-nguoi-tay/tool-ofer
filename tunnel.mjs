import { spawn, execSync } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const APP_DATA_DIR = join(homedir(), 'Library', 'Application Support', 'AutoLeadPC-2');
mkdirSync(APP_DATA_DIR, { recursive: true });
const TUNNEL_URL_FILE = join(APP_DATA_DIR, 'tunnel-url.txt');

let tunnelProcess = null;
let currentTunnelUrl = null;
let tunnelStartTime = 0;
let isStarting = false;
let startPromise = null;

/**
 * Tìm binary tailscale trên macOS.
 */
function findTailscaleBin() {
  const common = ['/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale', 'tailscale'];
  for (const p of common) {
    if (p === 'tailscale' || existsSync(p)) return p;
  }
  return null;
}

/**
 * Kiểm tra và kích hoạt Tailscale Funnel để có URL cố định vĩnh viễn (không đổi mỗi lần build).
 * @param {number} port
 * @returns {string|null}
 */
export function getTailscaleFunnel(port = 3211) {
  const bin = findTailscaleBin();
  if (!bin) return null;

  // 1. Kiểm tra trạng thái hiện tại
  try {
    const raw = execSync(`${bin} funnel status --json`, { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
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
    execSync(`${bin} funnel --bg ${port}`, { timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] });
    const raw = execSync(`${bin} funnel status --json`, { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
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

/**
 * Tìm đường dẫn thực thi của binary cloudflared trên macOS.
 */
function findCloudflaredBin() {
  const commonPaths = [
    '/opt/homebrew/bin/cloudflared',
    '/usr/local/bin/cloudflared',
    'cloudflared',
  ];
  for (const p of commonPaths) {
    if (p === 'cloudflared' || existsSync(p)) return p;
  }
  return 'cloudflared';
}

/**
 * Khởi động Tunnel trỏ tới port nội bộ.
 * Ưu tiên số 1: Tailscale Funnel (URL cố định vĩnh viễn, không đổi mỗi lần build app).
 * Dự phòng số 2: Cloudflare Tunnel.
 * @param {number} port - Port local cần tunnel (mặc định 3211)
 * @param {number} timeoutMs - Thời gian chờ tối đa lấy URL (mặc định 20s)
 * @returns {Promise<{ ok: boolean, url?: string, error?: string, provider?: string }>}
 */
export async function startTunnel(port = 3211, timeoutMs = 20000) {
  // 1. Ưu tiên kiểm tra Tailscale Funnel (URL cố định vĩnh viễn)
  try {
    const tsUrl = getTailscaleFunnel(port);
    if (tsUrl) {
      currentTunnelUrl = tsUrl;
      try { writeFileSync(TUNNEL_URL_FILE, tsUrl, 'utf8'); } catch {}
      console.log(`[Tunnel] 🌟 Đang sử dụng Tailscale Funnel URL CỐ ĐỊNH: ${tsUrl}`);
      return { ok: true, url: tsUrl, provider: 'tailscale', permanent: true };
    }
  } catch (err) {
    console.warn(`[Tunnel] Tailscale Funnel không sẵn sàng: ${err.message}, chuyển sang Cloudflare Tunnel...`);
  }

  // 2. Kiểm tra tunnel URL hiện có trong bộ nhớ
  if (currentTunnelUrl) {
    return { ok: true, url: currentTunnelUrl, cached: true };
  }

  // 2. Kiểm tra xem có tunnel nền nào đang chạy từ trước (tái sử dụng URL cũ)
  if (existsSync(TUNNEL_URL_FILE)) {
    try {
      const savedUrl = readFileSync(TUNNEL_URL_FILE, 'utf8').trim();
      if (savedUrl.startsWith('https://')) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        try {
          const checkRes = await fetch(`${savedUrl}/tunnel`, { signal: controller.signal });
          clearTimeout(timeout);
          if (checkRes.ok) {
            currentTunnelUrl = savedUrl;
            console.log(`[Tunnel] ✅ Tái sử dụng tunnel cố định đang hoạt động: ${savedUrl}`);
            return { ok: true, url: savedUrl, reused: true };
          }
        } catch {}
      }
    } catch {}
  }

  if (isStarting && startPromise) {
    return startPromise;
  }

  isStarting = true;
  startPromise = new Promise((resolve) => {
    try {
      const bin = findCloudflaredBin();
      console.log(`[Tunnel] Khởi động cloudflared tunnel trỏ tới port ${port}...`);

      const proc = spawn(bin, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      proc.unref();

      tunnelProcess = proc;
      tunnelStartTime = Date.now();

      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          isStarting = false;
          resolve({ ok: false, error: 'Hết thời gian chờ tạo URL tunnel (timeout 20s).' });
        }
      }, timeoutMs);

      const handleOutput = (chunk) => {
        const text = chunk.toString();
        // Tìm pattern https://xxx.trycloudflare.com
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !resolved) {
          const url = match[0];
          currentTunnelUrl = url;
          resolved = true;
          clearTimeout(timer);
          isStarting = false;
          console.log(`[Tunnel] ✅ Tunnel sẵn sàng: ${url}`);
          try {
            writeFileSync(TUNNEL_URL_FILE, url, 'utf8');
          } catch {}
          resolve({ ok: true, url });
        }
      };

      proc.stdout.on('data', handleOutput);
      proc.stderr.on('data', handleOutput);

      proc.on('error', (err) => {
        console.error(`[Tunnel] Lỗi spawn cloudflared:`, err.message);
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          isStarting = false;
          resolve({ ok: false, error: err.message });
        }
      });

      proc.on('exit', (code, signal) => {
        console.log(`[Tunnel] cloudflared thoát với mã code=${code}, signal=${signal}`);
        tunnelProcess = null;
        currentTunnelUrl = null;
        try {
          if (existsSync(TUNNEL_URL_FILE)) unlinkSync(TUNNEL_URL_FILE);
        } catch {}
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          isStarting = false;
          resolve({ ok: false, error: `cloudflared thoát sớm (code=${code})` });
        }
      });
    } catch (err) {
      isStarting = false;
      resolve({ ok: false, error: err.message });
    }
  });

  return startPromise;
}

/**
 * Lấy URL tunnel hiện tại nếu đang hoạt động.
 * @returns {string|null}
 */
export function getTunnelUrl() {
  if (currentTunnelUrl) return currentTunnelUrl;
  try {
    if (existsSync(TUNNEL_URL_FILE)) {
      const url = readFileSync(TUNNEL_URL_FILE, 'utf8').trim();
      if (url.startsWith('https://')) return url;
    }
  } catch {}
  return null;
}

/**
 * Dừng tunnel đang chạy.
 */
export function stopTunnel() {
  if (tunnelProcess) {
    try {
      process.kill(-tunnelProcess.pid, 'SIGTERM');
    } catch {
      try { tunnelProcess.kill('SIGTERM'); } catch {}
    }
    tunnelProcess = null;
  }
  currentTunnelUrl = null;
  isStarting = false;
  startPromise = null;
  try {
    if (existsSync(TUNNEL_URL_FILE)) unlinkSync(TUNNEL_URL_FILE);
  } catch {}
  console.log('[Tunnel] Đã dừng tunnel.');
}
