import { pendingObscuraSessions } from '../../obscura-engine/sessions.mjs';
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
import { stopAllContinuousAgents } from '../../continuous-agent/index.mjs';
import { cancelAutoStop } from '../../runtime/auto-stop-scheduler.mjs';
import { protectConfirmedLeadSession } from '../../leads/actions/protect-confirmed-lead-session.mjs';
import { writeFile } from 'node:fs/promises';

/**
 * Đóng trình duyệt do app mở và ghi nhận lệnh đóng toàn bộ trước khi ngắt kết nối.
 * Khi preserveLeadSessions=true (hẹn giờ tắt): các phiên đã có lead được giữ lại để làm nốt
 * và không tự bù slot; các phiên chưa có lead bị đóng ngay lập tức.
 *
 * @param {object|string} [options={}] Tùy chọn đóng phiên ({ preserveLeadSessions?: boolean }).
 * @return {Promise<{results: string[], warnings: string[], closedCount?: number, leadSessionsKeptCount?: number}>} Số trình duyệt đã đóng.
 * @throws {Error} Khi hệ thống không thể xử lý thao tác đóng phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
export async function closeActiveBrowsers(options = {}) {
  const preserveLeadSessions = Boolean(
    options && (
      options.preserveLeadSessions === true ||
      (typeof options === 'string' && options.includes('preserveLeadSessions'))
    )
  );
  const sessions = [...new Set([...activeBrowsers, ...pendingObscuraSessions])];
  cancelAutoStop();
  if (!preserveLeadSessions) {
    stopAllContinuousAgents('close_all'); // thu hồi quyền tab và giết agy/hủy request AI trước khi đóng browser
  }
  autoRefill.launchGeneration = (autoRefill.launchGeneration || 0) + 1;
  autoRefill.stopRequested = true;
  autoRefill.enabled = false;
  autoRefill.sequential = false;
  autoRefill.settings = null;
  autoRefill.targetCount = 0;
  autoRefill.queued = false;
  // Xóa settings đã lưu để không tự khởi động lại sau khi stop chủ động
  void writeFile(autoRefillSettingsPath, '{}', 'utf8').catch(() => {});
  applicationState.exclusiveQueue = Promise.resolve(); // Giải phóng ngay hàng đợi để không bị nghẽn

  const sessionsToClose = [];
  const leadSessionsKept = [];

  for (const session of sessions) {
    const hasLead = preserveLeadSessions && protectConfirmedLeadSession(session);
    if (hasLead) {
      session._autoStopLeadPending = true;
      session.suppressAutoRefill = true;
      leadSessionsKept.push(session);
      const slotNum = session.slot ?? (session.tileIndex ?? 0) + 1;
      const detail = `Đã đến giờ hẹn tắt nhưng Slot ${slotNum} (IP ${session.exitIp || 'chưa rõ'}) đã có lead: Giữ trình duyệt để hoàn tất nốt, không tự bù slot sau khi đóng.`;
      console.log(`[AutoStop] ${detail}`);
      session.addBrowserLog?.({
        type: 'auto_stop_lead_preserved',
        detail
      });
      continue;
    }

    session.addBrowserLog?.({
      type: 'browser_close_all_requested',
      detail: preserveLeadSessions
        ? 'Hết giờ hẹn chạy: IP chưa có lead nên tự đóng (không bù slot).'
        : 'Nhận lệnh Đóng tất cả/Dừng toàn bộ từ app.'
    });
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
    sessionsToClose.push(session);
  }

  if (leadSessionsKept.length > 0) {
    autoRefill.message = `Hết giờ hẹn chạy: Đã đóng ${sessionsToClose.length} phiên chưa có lead; đang giữ ${leadSessionsKept.length} phiên có lead làm nốt (không bù slot).`;
  } else {
    autoRefill.message = 'Đã dừng toàn bộ luồng; tự bù đã tắt.';
  }

  await Promise.allSettled(sessionsToClose.map(async session => {
    session.suppressAutoRefill = true;
    session.isClosed = true;
    if (session.isObscura || session.engine === 'obscura') {
      if (typeof session.close === 'function') {
        await session.close().catch(() => {});
      }
      if (!session.isObscuraProcessAlive?.()) activeBrowsers.delete(session);
      else session.isClosed = false;
      return;
    }
    if (session.isGoLogin && session.closeGoLoginSession) {
      await session.closeGoLoginSession();
      activeBrowsers.delete(session);
      return;
    }
    if (session.isManagedProfile && session.profileId) {
      if (session.browser && typeof session.browser.close === 'function') {
        await session.browser.close().catch(() => {});
      }
      await requestManagedProfileStop(session);
      activeBrowsers.delete(session);
      return;
    }
    try {
      await Promise.race([session.browser?.close?.(), new Promise((_, reject) => setTimeout(() => reject(new Error('close timeout')), 2000))]);
    } catch {}
    if (session._cdpBrowser) {
      try {
        await session._cdpBrowser?.close?.();
      } catch {}
    }
    if (session.proxyKey) {
      await executeFile('pkill', ['-9', '-f', `user-data-dir.*${session.proxyKey}`]).catch(() => {});
    }
    activeBrowsers.delete(session);
  }));

  let stoppedSessions = sessionsToClose;
  // Chỉ kill hàng loạt khi dừng hẳn toàn bộ (không giữ phiên có lead)
  if (leadSessionsKept.length === 0) {
    await executeFile('pkill', ['-9', '-f', 'chrome-regular-builds']).catch(() => {});
    await executeFile('pkill', ['-9', '-f', 'user-data-dir.*chrome-profiles']).catch(() => {});
    await executeFile('pkill', ['-9', '-f', 'user-data-dir.*AutoLeadPC']).catch(() => {});

    // Pass 2: bắt các browser vừa được add vào activeBrowsers trong lúc pass 1 đang chạy
    await new Promise(r => setTimeout(r, 800));
    const lateComers = [...new Set([...activeBrowsers, ...pendingObscuraSessions])];
    for (const s of lateComers) {
      s.addBrowserLog?.({ type: 'browser_close_all_requested', detail: 'Đóng phiên mở muộn theo lệnh Đóng tất cả/Dừng toàn bộ.' });
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
      if (s.isObscura || s.engine === 'obscura') await s.close?.().catch(() => {});
      else if (s.isGoLogin && s.closeGoLoginSession) await s.closeGoLoginSession();
      else await (s.browser ?? s.context)?.close?.().catch(() => {});
      if (s.isManagedProfile && s.profileId && !s.isObscura && s.engine !== 'obscura') {
        await requestManagedProfileStop(s).catch(() => {});
      }
    }
    activeBrowsers.clear();
    stoppedSessions = [...new Set([...sessionsToClose, ...lateComers])];
    const unfinishedGoLogin = stoppedSessions.filter(session => session.isGoLogin && !session._gologinProfileStopped);
    const unfinishedObscura = stoppedSessions.filter(session => (session.isObscura || session.engine === 'obscura') && session.isObscuraProcessAlive?.());
    for (const session of unfinishedObscura) { session.isClosed = false; activeBrowsers.add(session); }
    if (!unfinishedGoLogin.length && !unfinishedObscura.length) {
      activeProxyLocks.clear();
      activeExitIpLocks.clear();
    }
    const adsPowerToken = await readAdsPowerApiKey().catch(() => null);
    if (adsPowerToken) {
      void cleanupOrphanedAdsPowerProfiles(adsPowerToken, new Set(), fetch, 10).catch(() => {});
    }
  }

  const unfinishedObscura = stoppedSessions.filter(session => (session.isObscura || session.engine === 'obscura') && session.isObscuraProcessAlive?.());
  const unfinishedGoLogin = stoppedSessions.filter(session => session.isGoLogin && !session._gologinProfileStopped);
  const closedCount = stoppedSessions.length - unfinishedObscura.length - unfinishedGoLogin.length;
  const warnings = [];
  if (unfinishedObscura.length) warnings.push('Obscura chưa dừng; giữ phiên và khóa proxy/IP để thử đóng lại.');
  if (unfinishedGoLogin.length) warnings.push('Chưa dừng được một số phiên GoLogin; giữ khóa IP/proxy và profile.');
  if (stoppedSessions.some(session => session.isGoLogin && session._gologinProfileStopped && session._gologinProfileDeleted === false)) warnings.push('Orbita đã dừng nhưng có profile chưa xóa được trên GoLogin; kiểm tra nhật ký GoLogin.');
  autoRefill.message = `Đã đóng ${closedCount} trình duyệt; tự bù đã tắt.${leadSessionsKept.length ? ` Giữ ${leadSessionsKept.length} phiên có lead làm nốt.` : ''}${unfinishedObscura.length || unfinishedGoLogin.length ? ' Còn phiên chưa xác nhận dừng.' : ''}`;
  return {
    results: [autoRefill.message], warnings, closedCount,
    leadSessionsKeptCount: leadSessionsKept.length, autoRefillEnabled: false
  };
}
