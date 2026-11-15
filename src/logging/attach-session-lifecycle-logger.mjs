import { randomUUID } from 'node:crypto';
import { browserSessionLogs, queueSaveBrowserLogs, savePersistedBrowserLogs } from './browser-logs.mjs';
import { stampLogSeq } from './browser-logs/stamp-log-seq.mjs';
import { limitSessionEvents } from './recorder/limit-session-events.mjs';
import { syncBrowserLogSessionMetadata } from './browser-logs/sync-session-metadata.mjs';

const lifecycleTypes = new Set([
  'adsmith_loading_timeout_reload', 'adsmith_loading_reload_failed', 'iframe_load_exhausted',
  'gologin_process_exited', 'gologin_starting', 'gologin_started', 'gologin_device_detected', 'gologin_close_requested', 'gologin_cdp_disconnected', 'gologin_connection_restored', 'gologin_reconnect_failed', 'window_visibility_error',
  'gologin_start_failed', 'gologin_profile_stop_failed', 'gologin_profile_deleted', 'gologin_profile_delete_failed', 'gologin_exit_ip_changed', 'gologin_device_error', 'session_exit_ip_observed', 'slot_launch_timeout', 'max_run_timeout', 'gologin_geo_restart', 'gologin_geo_unverified', 'lead_check_targets', 'lead_ip_resolved', 'lead_confirmed', 'lead_observed', 'lead_failed', 'lead_ip_mismatch_closed',
  'manual_browser_closed', 'manual_browser_closed_refill', 'browser_close_all_requested',
  'last_tab_closed_auto', 'lead_browser_kept_open', 'thankyou_completed',
  'traffic_blocked', 'toffers_duplicate_ip', 'adtrapper_disabled_close', 'adtrapper_stuck_close',
  'sub_offer_tab_closed', 'thankyou_tab_closed', 'duplicate_tab_closed', 'excluded_tab_closed', 'tab_limit_closed',
  'stuck_page_reload', 'stuck_page_reload_exhausted', 'stuck_page_reload_failed',
  'sweepstakes_sub_tab_timeout', 'sweepstakes_completed',
]);
const browserCloseTypes = new Set([
  'gologin_close_requested',
  'gologin_start_failed',
  'lead_failed', 'lead_ip_mismatch_closed', 'max_run_timeout', 'manual_browser_closed', 'manual_browser_closed_refill',
  'browser_close_all_requested', 'last_tab_closed_auto', 'thankyou_completed', 'sweepstakes_completed',
  'traffic_blocked', 'toffers_duplicate_ip', 'adtrapper_disabled_close', 'adtrapper_stuck_close',
]);

/**
 * Giữ bằng chứng lead/đóng phiên và HTML từng ô nhập theo yêu cầu, không chụp toàn trang.
 * @param {object} context Context đang được ghi nhận.
 * @param {object} session Phiên sở hữu IP và trạng thái lead.
 * @param {object} recording Nhật ký phiên đã đăng ký trong lịch sử.
 * @return {Function} Callback nhận các mốc vòng đời, bỏ qua log thao tác thông thường.
 * @throws {Error} Khi context không hỗ trợ đăng ký listener.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export function attachSessionLifecycleLogger(context, session, recording) {
  let ended = false;
  let closeRequest = null;

  /**
   * Lưu mốc quan trọng cùng IP/lead tại thời điểm sự kiện; bỏ query nhạy cảm trong mô tả.
   * @param {object} entry Mốc lead hoặc lý do đóng từ luồng nghiệp vụ.
   * @return {object|null} Mốc đã lưu hoặc null nếu là log thao tác.
   * @throws {Error} Khi recorder của phiên không còn hợp lệ.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-15
   */
  function recordLifecycle(entry) {
    const isInputHtml = entry.type === 'input_fill_html';
    if (!lifecycleTypes.has(entry.type) && entry.type !== 'session_closed' && !isInputHtml) return null;
    const detail = String(entry.detail || '').replace(/https?:\/\/[^\s<>]+/g, value => {
      try { const url = new URL(value); url.search = ''; url.hash = ''; url.username = ''; url.password = ''; return url.href; }
      catch { return '[URL]'; }
    });
    const confirmedLeadIp = session.confirmedLeadIp || recording.confirmedLeadIp || (session.leadCheckStatus === 'confirmed' ? session.exitIp : null);
    syncBrowserLogSessionMetadata(recording, session);
    const event = {
      id: randomUUID(), sequence: (recording.logs.at(-1)?.sequence || 0) + 1, time: new Date().toISOString(), source: 'browser',
      type: entry.type, detail, ip: session.exitIp || recording.ip, confirmedLeadIp,
      leadStatus: session.leadCheckStatus || null, slot: recording.slot,
      closeReasonType: entry.closeReasonType || null,
      phase: session.startupPhase || null, ipVerified: session.ipVerified === true,
      errorName: entry.errorName || null, reasonCode: entry.reasonCode || null,
      expectedExitIp: entry.expectedExitIp || null, actualExitIp: entry.actualExitIp || null,
      closingDueToNoLead: Boolean(session.closingDueToNoLead),
      closingDueToTrafficBlocked: Boolean(session.closingDueToTrafficBlocked),
      suppressAutoRefill: Boolean(session.suppressAutoRefill),
      profileOs: entry.profileOs ?? null, orbitaVersion: entry.orbitaVersion ?? null,
      platform: entry.platform ?? null, userAgent: entry.userAgent ?? null,
      uaPlatform: entry.uaPlatform ?? null, uaPlatformVersion: entry.uaPlatformVersion ?? null,
      uaMobile: entry.uaMobile ?? null, touchPoints: entry.touchPoints ?? null,
      ...(isInputHtml ? { html: entry.html, fieldId: entry.fieldId, fieldName: entry.fieldName, fieldType: entry.fieldType, pageUrl: entry.pageUrl, frameUrl: entry.frameUrl } : {}),
    };
    recording.confirmedLeadIp = confirmedLeadIp;
    if (browserCloseTypes.has(entry.type) && (!closeRequest || entry.type !== 'gologin_close_requested')) closeRequest = event;
    recording.logs.push(event);
    limitSessionEvents(recording);
    stampLogSeq(event);
    queueSaveBrowserLogs(isInputHtml ? 5000 : 250);
    if (!isInputHtml) console.log(`[Lifecycle] Slot ${recording.slot} IP ${event.ip || '?'} lead=${confirmedLeadIp || 'chưa xác nhận'} ${event.type}: ${detail}`);
    return event;
  }

  /**
   * Chốt phiên đúng một lần khi context đóng hoặc CDP mất kết nối, không suy đoán crash/nút X.
   * @param {string} signal Sự kiện trình duyệt thực sự phát ra.
   * @return {void} Lưu ngay nhật ký để giảm nguy cơ mất lý do khi tiến trình kết thúc.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-13
   */
  function finish(signal) {
    if (ended) return;
    ended = true;
    recording.endedAt = new Date().toISOString();
    const event = recordLifecycle({
      type: 'session_closed', closeReasonType: closeRequest?.type || 'unknown_external_close',
      detail: closeRequest
        ? `${signal}. Mốc yêu cầu đóng gần nhất: ${closeRequest.type}: ${closeRequest.detail}`
        : `${signal}. Không ghi nhận yêu cầu đóng từ app; chưa phân biệt được nút X, crash hoặc mất kết nối CDP.`,
    });
    recording.closeReason = event.detail;
    recording.closeReasonType = event.closeReasonType;
    browserSessionLogs.delete(session);
    void savePersistedBrowserLogs();
  }
  context.on('close', () => finish(session.isGoLogin ? 'Phiên GoLogin đã kết thúc' : 'Context trình duyệt đã đóng'));
  const connection = session._cdpBrowser || context.browser?.();
  connection?.on?.('disconnected', () => finish('Mất kết nối trình duyệt qua CDP'));
  return recordLifecycle;
}
