import { activeBrowsers } from '../../browser/sessions.mjs';
import { activeExitIpLocks } from '../constants/active-exit-ip-locks.mjs';
import { autoRefill } from '../constants/auto-refill.mjs';
import { queueAutomaticRefill } from '../../refill/actions/queue-automatic-refill.mjs';
import { releaseProxyLock } from '../../proxy/actions/release-proxy-lock.mjs';
import { requestManagedProfileStop } from '../../browser/actions/request-managed-profile-stop.mjs';

/**
 * Loại khỏi danh sách phiên AdsPower những kết nối CDP đã đóng.
 *
 * @return {Promise<void>} Hoàn tất sau khi dọn trạng thái phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function pruneDeadManagedSessions() {
  for (const s of [...activeBrowsers]) {
    if (s.isManagedProfile && s.profileId && !s._cdpBrowser?.isConnected()) {
      if (s._monitorInterval) {
        clearInterval(s._monitorInterval);
        s._monitorInterval = null;
      }
      s.isClosed = true;
      releaseProxyLock(s.proxy, s.exitIp);
      if (!s.proxy) activeExitIpLocks.delete('Direct');
      activeBrowsers.delete(s);
      void requestManagedProfileStop(s);
      console.log(`[AdsPower] Đã tự dọn session đóng cho profile ${s.profileId} (Slot ${s.slot}).`);
      if (!s.suppressAutoRefill && autoRefill.enabled && !autoRefill.stopRequested) queueAutomaticRefill();
    }
  }
}
