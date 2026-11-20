import { spawn } from 'node:child_process';
import http from 'node:http';
import { createInterface } from 'node:readline';
import { resolveObscuraBinary } from './resolve-obscura-binary.mjs';
import { OBSCURA_DEFAULT_PORT, OBSCURA_CONNECT_TIMEOUT_MS, OBSCURA_READY_POLL_INTERVAL_MS } from './constants.mjs';

/**
 * Kiểm tra xem cổng HTTP của Obscura CDP Server đã sẵn sàng nhận kết nối hay chưa.
 *
 * @param {number} port Cổng lắng nghe của Obscura.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 * @return {Promise<boolean>}
 */
async function checkObscuraReady(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/json/version`, { timeout: 1000 }, (res) => {
      res.resume();
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        resolve(false);
      }
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Chờ Obscura CDP Server khởi động và sẵn sàng.
 *
 * @param {number} port Cổng lắng nghe của Obscura.
 * @param {number} timeoutMs Thời gian tối đa chờ đợi.
 * @param {object|null} child Process để phát hiện lỗi khởi động.
 * @throws {Error} Khi process thoát hoặc quá hạn CDP.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 * @return {Promise<void>}
 */
async function waitForObscuraReady(port, timeoutMs = OBSCURA_CONNECT_TIMEOUT_MS, child = null) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (child && (child.exitCode !== null || child.signalCode !== null)) throw new Error('Obscura đã thoát trước khi CDP sẵn sàng.');
    const ready = await checkObscuraReady(port);
    if (ready) return;
    await new Promise((r) => setTimeout(r, OBSCURA_READY_POLL_INTERVAL_MS));
  }
  throw new Error(`Obscura CDP Server tại 127.0.0.1:${port} không phản hồi sau ${timeoutMs}ms.`);
}

/**
 * Khởi động một phiên Obscura CDP Server độc lập.
 *
 * @param {object} options
 * @param {number} [options.slot] Slot hiển thị cùng số đo khi bật debug hiệu năng.
 * @param {number} [options.port=9222] Cổng lắng nghe CDP.
 * @param {string} [options.proxy] Proxy upstream (http:// hoặc socks5://).
 * @param {number} [options.timeoutMs=15000] Thời gian tối đa chờ server sẵn sàng.
 * @param {string} [options.timezone] Múi giờ của IP đã xác minh.
 * @param {string} [options.userAgent] Danh tính HTTP của profile.
 * @param {object} [options.headers] Header Client Hints/ngôn ngữ đồng bộ.
 * @param {Function|null} [options.onSpawn] Đăng ký process ngay khi spawn để Stop/shutdown không bỏ sót.
 * @param {string} [options.tlsProfile] Profile TLS/HTTP2 của engine (chrome-windows|chrome-macos|chrome-linux|chrome-android|safari-ios|safari-ipad).
 * @param {object|null} [options.identity] Danh tính thiết bị (profile + seed + public_ip) cho bề mặt native của engine.
 * @throws {Error} Khi spawn hoặc CDP không sẵn sàng.
 * @return {Promise<{ port: number, cdpEndpoint: string, process: import('node:child_process').ChildProcess, pid: number }>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function startObscuraSession({ slot, port = OBSCURA_DEFAULT_PORT, proxy = null, timeoutMs = OBSCURA_CONNECT_TIMEOUT_MS, timezone = 'UTC', userAgent = '', headers = {}, onSpawn = null,
  tlsProfile = 'chrome-windows', identity = null } = {}) {
  const binary = resolveObscuraBinary();
  const args = ['serve', String(port)];
  if (proxy) {
    args.push(proxy);
  }

  const child = spawn(binary, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env: { ...process.env, TZ: timezone, AUTOLEADPC_OBSCURA_PERSISTENT: '1', AUTOLEADPC_OBSCURA_USER_AGENT: userAgent, AUTOLEADPC_OBSCURA_HEADERS: JSON.stringify(headers),
      // TLS/HTTP2 giống trình duyệt thật theo thiết bị; không chặn tracker vì offer cần script chứng thực lead/pixel.
      AUTOLEADPC_OBSCURA_TLS_PROFILE: tlsProfile, OBSCURA_BLOCK_TRACKERS: '0',
      // Danh tính thiết bị để engine trả giá trị gốc (WebGL, font, giọng đọc, media, WebRTC) thay vì vá bằng script tiêm.
      ...(identity ? { AUTOLEADPC_OBSCURA_IDENTITY: JSON.stringify(identity) } : {}) },
  });

  onSpawn?.(child);
  child.stdout.resume();
  if (process.env.AUTOLEADPC_OBSCURA_PERF === '1') {
    const timings = /^\[ObscuraPerf\] (?:begin|end|navigation_wait|queue_full|navigation_end|first_frame|ack_wait|ack_resume)(?: (?:op=(?:attach|detach|start_stream|stop_stream|navigate|reload)|(?:tab|loading_tab|conn|id|queue_ms|tabs|deferred|run_ms|stream|render_us|encode_pack_us|wait_ms|elapsed_ms|committed|cancelled|failed|requested_post|http_status)=\d+))+$/;
    createInterface({ input: child.stderr }).on('line', line => {
      if (timings.test(line)) console.info(`[Process] ${new Date().toISOString()} slot=${Number.isInteger(slot) ? slot : 0} port=${port} pid=${child.pid} ${line}`);
      else if (line) console.debug(`[Obscura:${port}:stderr]`, line);
    });
  } else {
    child.stderr.on('data', (chunk) => {
      const msg = chunk.toString().trim();
      if (msg) console.debug(`[Obscura:${port}:stderr]`, msg);
    });
  }

  child.on('error', (err) => {
    console.error(`[Obscura:${port}] Lỗi tiến trình:`, err);
  });

  try {
    await waitForObscuraReady(port, timeoutMs, child);
  } catch (err) {
    child.kill('SIGKILL');
    throw err;
  }

  child.unref();

  return {
    port,
    cdpEndpoint: `http://127.0.0.1:${port}`,
    process: child,
    pid: child.pid,
  };
}
