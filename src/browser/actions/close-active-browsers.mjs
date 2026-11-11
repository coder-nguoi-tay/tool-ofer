import { activeBrowsers } from '../sessions.mjs';
import { activeExitIpLocks } from '../../runtime/constants/active-exit-ip-locks.mjs';
import { activeProxyLocks } from '../../runtime/constants/active-proxy-locks.mjs';
import { applicationState } from '../../runtime/application-state.mjs';
import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { autoRefillSettingsPath } from '../../runtime/constants/auto-refill-settings-path.mjs';
import { cleanupOrphanedAdsPowerProfiles } from '../../../adspower-profile.mjs';
import { executeFile } from '../../runtime/constants/execute-file.mjs';
import { readAdsPowerApiKey } from '../../runtime/actions/read-ads-power-api-key.mjs';
import { requestManagedProfileStop } from './request-managed-profile-stop.mjs';
import { writeFile } from 'node:fs/promises';

/**
 * Đóng mọi trình duyệt do app mở.
 *
 * Playwright chạy Chromium với --no-startup-window nên đóng hết cửa sổ không làm tiến
 * trình thoát — nó nằm chờ trên CDP pipe và vẫn hiện icon dưới Dock. Phải gọi close().
 *
 * @return {Promise<{results: string[], warnings: string[]}>} Số trình duyệt đã đóng.
 * @throws {Error} Khi hệ thống không thể xử lý thao tác đóng phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function closeActiveBrowsers() {
  const sessions = [...activeBrowsers];
  autoRefill.stopRequested = true;
  autoRefill.enabled = false;
  autoRefill.sequential = false;
  autoRefill.settings = null;
  autoRefill.targetCount = 0;
  autoRefill.queued = false;
  // Xóa settings đã lưu để không tự khởi động lại sau khi stop chủ động
  void writeFile(autoRefillSettingsPath, '{}', 'utf8').catch(() => {});
  autoRefill.message = 'Đã dừng toàn bộ luồng; tự bù đã tắt.';
  applicationState.exclusiveQueue = Promise.resolve(); // Giải phóng ngay hàng đợi để không bị nghẽn

  for (const session of sessions) {
    session.suppressAutoRefill = true;
    session.isClosed = true;
    if (session._monitorInterval) {
      clearInterval(session._monitorInterval);
      session._monitorInterval = null;
    }
    if (session._autofillTimer) {
      clearInterval(session._autofillTimer);
      session._autofillTimer = null;
    }
  }
  await Promise.allSettled(sessions.map(async session => {
    session.suppressAutoRefill = true;
    session.isClosed = true;
    if (session.isManagedProfile && session.profileId) {
      if (session.browser && typeof session.browser.close === 'function') {
        await session.browser.close().catch(() => {});
      }
      await requestManagedProfileStop(session);
      return;
    }
    try {
      await Promise.race([session.browser?.close?.(), new Promise((_, reject) => setTimeout(() => reject(new Error('close timeout')), 2000))]);
    } catch {}
    if (session.proxyKey) {
      await executeFile('pkill', ['-9', '-f', `user-data-dir.*${session.proxyKey}`]).catch(() => {});
    }
  }));

  // Chỉ đóng những phiên Chrome mà app quản lý.
  await executeFile('pkill', ['-9', '-f', 'chrome-regular-builds']).catch(() => {});
  await executeFile('pkill', ['-9', '-f', 'user-data-dir.*chrome-profiles']).catch(() => {});
  await executeFile('pkill', ['-9', '-f', 'user-data-dir.*AutoLeadPC']).catch(() => {});

  // Pass 2: bắt các browser vừa được add vào activeBrowsers trong lúc pass 1 đang chạy
  await new Promise(r => setTimeout(r, 800));
  const lateComers = [...activeBrowsers];
  for (const s of lateComers) {
    s.suppressAutoRefill = true;
    s.isClosed = true;
    if (s._monitorInterval) {
      clearInterval(s._monitorInterval);
      s._monitorInterval = null;
    }
    if (s._autofillTimer) {
      clearInterval(s._autofillTimer);
      s._autofillTimer = null;
    }
    await (s.browser ?? s.context)?.close?.().catch(() => {});
    if (s.isManagedProfile && s.profileId) {
      await requestManagedProfileStop(s).catch(() => {});
    }
  }
  activeBrowsers.clear();
  activeProxyLocks.clear();
  activeExitIpLocks.clear();
  const adsPowerToken = await readAdsPowerApiKey().catch(() => null);
  if (adsPowerToken) {
    void cleanupOrphanedAdsPowerProfiles(adsPowerToken, new Set(), fetch, 10).catch(() => {});
  }
  return {
    results: [sessions.length > 0 ? 'Đã đóng ' + sessions.length + ' trình duyệt và dừng hẳn toàn bộ luồng.' : 'Đã đóng toàn bộ trình duyệt trên màn hình và dừng hẳn.'],
    warnings: [],
    autoRefillEnabled: false
  };
}
