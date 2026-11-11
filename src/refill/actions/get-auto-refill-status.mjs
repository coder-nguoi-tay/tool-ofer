import { protectConfirmedLeadSession } from '../../leads/actions/protect-confirmed-lead-session.mjs';
import { activeBrowsers } from '../../browser/sessions.mjs';
import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { formatBytes } from '../../monitoring/bandwidth.mjs';
import { getBandwidthSummary } from '../../runtime/actions/get-bandwidth-summary.mjs';
import { leadIpStatsMap } from '../../../lead-check.mjs';
import { pruneDeadManagedSessions } from '../../runtime/actions/prune-dead-managed-sessions.mjs';

/**
 * Trả trạng thái tự bù và IP đã xác minh của từng cửa sổ Chrome đang mở.
 *
 * @return {object} Trạng thái hiện tại của trình duyệt và cơ chế tự bù.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function getAutoRefillStatus() {
  void pruneDeadManagedSessions().catch(() => {});
  return {
    enabled: autoRefill.enabled,
    sequential: autoRefill.sequential,
    activeCount: activeBrowsers.size,
    targetCount: autoRefill.targetCount,
    message: autoRefill.message,
    bandwidth: getBandwidthSummary(),
    chromeSessions: [...activeBrowsers].filter(session => !session.isClosed && session.chromeVersion && (session.exitIp || session.isManagedProfile)).map(session => {
      protectConfirmedLeadSession(session);
      const livePages = session.browser?.pages ? session.browser.pages().filter(p => !p.isClosed()) : [];
      const tabCount = Math.max(1, livePages.length);
      const tabsInfo = livePages.map((p, idx) => ({
        index: idx,
        url: (typeof p.url === 'function' ? p.url() : '') || '',
        aiRunning: Boolean(p._aiAssistRunning || p._aiFormFixing),
        bandwidthBytes: p._bandwidthBytes || 0,
        bandwidthFormatted: formatBytes(p._bandwidthBytes || 0),
        bytesSent: p._bytesSent || 0,
        bytesReceived: p._bytesReceived || 0,
        requestCount: p._requestCount || 0
      }));
      const anyTabAiRunning = Boolean(session.aiAssistRunning || livePages.some(p => p._aiAssistRunning || p._aiFormFixing));
      const aiRunningCount = livePages.filter(p => p._aiAssistRunning || p._aiFormFixing).length;
      return {
        slot: session.slot ?? session.tileIndex + 1,
        version: session.chromeVersion,
        deviceProfile: session.deviceProfile ?? 'windows',
        deviceVersion: session.deviceVersion ?? (session.deviceSummary ? session.deviceSummary.split(' · ')[0] : session.deviceProfile),
        deviceSummary: session.deviceSummary ?? null,
        isWindowVisible: Boolean(session.isWindowVisible),
        exitIp: session.exitIp ?? (session.isManagedProfile ? session.chromeVersion : null),
        proxy: session.proxyServer ?? session.proxyKey ?? null,
        assignedEmail: session.assignedEmail ?? null,
        assignedPass: session.assignedPass ?? (session.currentRecord?.pass || session.currentRecord?.password || '******'),
        assignedRecover: session.assignedRecover ?? (session.currentRecord?.recover || session.currentRecord?.recoveryEmail || '--'),
        autofillRecord: session.autofillRecord ?? null,
        autofillFields: session.autofillFields ?? 0,
        autofillActions: session.autofillActions ?? 0,
        autofillError: session.autofillError ?? null,
        completedScreens: session.completedScreens ?? 0,
        currentScreen: session.currentScreen ?? (session.completedScreens ?? 0) + 1,
        pageJumps: session.pageJumps ?? 0,
        screenReached: session.screenReached ?? session.currentScreen ?? 1,
        leadCheckStatus: session.leadCheckStatus ?? null,
        leadCheckMessage: session.leadCheckMessage ?? null,
        leadObserveStatus: session.leadObserveStatus ?? null,
        leadObserveMessage: session.leadObserveMessage ?? null,
        emailFilled: Boolean(session.emailFilled),
        emailScreenSubmitted: Boolean(session.emailScreenSubmitted),
        leadCheckEnabled: session.enableLeadCheck !== false,
        extensions: session.extensions ?? null,
        streamRole: session.streamRole ?? 1,
        streamLabel: session.streamLabel ?? '',
        offerNumber: session.offerNumber ?? session.streamRole ?? 1,
        websiteUrl: session.websiteUrl ?? null,
        bandwidthBytes: session.bandwidthBytes || 0,
        bandwidthFormatted: formatBytes(session.bandwidthBytes || 0),
        bytesSent: session.bytesSent || 0,
        bytesReceived: session.bytesReceived || 0,
        requestCount: session.requestCount || 0,
        tabCount,
        tabs: tabsInfo,
        aiRunning: anyTabAiRunning,
        aiStatus: anyTabAiRunning ? tabCount > 1 ? `Đang phân tích form bằng AI (${aiRunningCount || 1}/${tabCount} tabs)...` : 'Đang phân tích form bằng AI...' : session.autofillFields ? `Đã điền ${session.autofillFields} trường` : 'Sẵn sàng',
        action: anyTabAiRunning ? tabCount > 1 ? `🤖 AI đang chạy trên ${aiRunningCount || 1}/${tabCount} tabs` : '🤖 AI đang phân tích & điền form' : session.lastActionText || (session.autofillFields ? `Đã điền ${session.autofillFields} ô` : session.websiteUrl ? 'Đang duyệt' : 'Running'),
        lastLog: session.logs && session.logs.length > 0
        // Ép chỉ giữ các trường chuỗi/số — tránh object Playwright (frame/page) lọt vào gây
        // JSON.stringify nổ → GET /state chết âm thầm.
        ? {
          time: String(session.logs[session.logs.length - 1]?.time || ''),
          type: String(session.logs[session.logs.length - 1]?.type || ''),
          detail: String(session.logs[session.logs.length - 1]?.detail || '')
        } : null
      };
    }).sort((firstSession, secondSession) => firstSession.slot - secondSession.slot),
    leadStats: Object.fromEntries(leadIpStatsMap)
  };
}
