import { TUNNEL_URL_FILE } from './state/tunnel-url-file.mjs';
import { existsSync } from 'node:fs';
import { moduleState } from './state/module-state.mjs';
import { unlinkSync } from 'node:fs';

/**
 * Dừng tunnel đang chạy.
 * @return {void} Kết quả xử lý stop tunnel.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function stopTunnel() {
  if (moduleState.tunnelProcess) {
    try {
      process.kill(-moduleState.tunnelProcess.pid, 'SIGTERM');
    } catch {
      try {
        moduleState.tunnelProcess.kill('SIGTERM');
      } catch {}
    }
    moduleState.tunnelProcess = null;
  }
  moduleState.currentTunnelUrl = null;
  moduleState.isStarting = false;
  moduleState.startPromise = null;
  try {
    if (existsSync(TUNNEL_URL_FILE)) unlinkSync(TUNNEL_URL_FILE);
  } catch {}
  console.log('[Tunnel] Đã dừng tunnel.');
}
export { stopTunnel };
