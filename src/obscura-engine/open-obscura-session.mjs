import { pendingObscuraSessions } from './sessions.mjs';
import { openObscuraBrowser } from './open-obscura-browser.mjs';
import { initializeObscuraRuntime } from './initialize-obscura-runtime.mjs';
import { fetchProxyGeo } from '../gologin-profile/fetch-proxy-geo.mjs';
import { waitForStableProxyIp } from '../proxy/actions/wait-for-stable-proxy-ip.mjs';
import { verifyBrowserExitIp } from '../proxy/actions/verify-browser-exit-ip.mjs';
import { startGoLoginSessionRecording as startSessionRecording } from '../browser/gologin/start-session-recording.mjs';
import { activeBrowsers } from '../browser/sessions.mjs';
import { takeNextEmail } from '../queues/email.mjs';
import { startAuthenticatedHttpRelay } from '../relay/start-authenticated-http-relay.mjs';
import { startAuthenticatedSocksRelay } from '../relay/start-authenticated-socks-relay.mjs';
import { recordRelayUsage } from '../monitoring/bandwidth/record-relay-usage.mjs';
import { queueAutomaticRefill } from '../refill/actions/queue-automatic-refill.mjs';
import { releaseProxyLock } from '../proxy/actions/release-proxy-lock.mjs';
import { autoRefill } from '../runtime/constants/auto-refill.mjs';
import { screencastSessions } from '../runtime/constants/screencast-sessions.mjs';
import { decorateGoLoginPages } from '../browser/gologin/decorate-profile-pages.mjs';
import { releaseScreencast } from '../browser/screencast.mjs';

/**
 * Cấp engine Obscura cho bộ launcher chung: xác minh IP trước offer và gắn đủ tác vụ của phiên.
 * @param {object} options Proxy đã khóa, offer/record/lead/script và callback lịch sử của launcher.
 * @return {Promise<{session: object, finalUrl: string}>} Phiên được quản lý và URL sau điều hướng.
 * @throws {Error} Khi proxy/geo/IP không hợp lệ, engine lỗi hoặc lượt Start đã bị hủy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
export async function openObscuraSession(options) {
  const { proxy, tileIndex, websiteUrl, usedExitIps, onExitIp, leadConfig, shouldAbort, delayStop = 0 } = options;
  if (!proxy?.server) throw new Error('Obscura yêu cầu proxy hợp lệ; không mở bằng IP trực tiếp.');
  const geo = await waitForStableProxyIp(proxy, () => fetchProxyGeo(proxy));
  if (!geo?.timezone) throw new Error('Không xác minh được IP/múi giờ của proxy; không mở offer.');
  if (shouldAbort()) throw new Error('Đã hủy lượt mở Obscura.');
  let relay, session, started = false;
  const startupSession = { proxy, proxyKey: options.proxyKey, proxyServer: proxy.server, slot: tileIndex + 1, tileIndex, websiteUrl, offerNumber: options.offerNumber, engine: 'obscura', exitIp: geo.ip, startupPhase: 'engine_start' };
  startSessionRecording(startupSession, 'Obscura');
  try {
    relay = proxy.username ? await (proxy.server.startsWith('socks5:') ? startAuthenticatedSocksRelay(proxy) : startAuthenticatedHttpRelay(proxy)) : { proxy, close: async () => {} };
    startupSession.onClosed = async () => {
      recordRelayUsage(relay.readBytes?.());
      await relay.close().catch(() => {});
      releaseProxyLock(proxy, startupSession.ownedExitIp || null);
      startupSession.finishRecording();
      const viewer = screencastSessions.get(startupSession.slot);
      if (viewer) {
        await releaseScreencast(viewer).catch(() => {});
        viewer.sseResponse?.end();
        screencastSessions.delete(startupSession.slot);
      }
      if (started && !startupSession.suppressAutoRefill && autoRefill.enabled && !autoRefill.stopRequested && !autoRefill.noSlotRefill) {
        queueAutomaticRefill(2000 + delayStop * 1000);
      }
    };
    session = await openObscuraBrowser({
      slot: tileIndex + 1, proxy: relay.proxy, geo, os: options.deviceProfile,
      targetUrl: null, registerSession: false, antiFingerprint: options.antiFingerprint, startupSession,
    });
    Object.assign(session, {
      proxy, proxyKey: options.proxyKey, proxyServer: proxy.server, websiteUrl,
      offerNumber: options.offerNumber, offer: options.offerNumber, streamRole: options.streamRole,
      streamLabel: options.streamLabel, offerSolver: options.offerSolver,
      enableLeadCheck: leadConfig.enabled === true, stopAutofillOnLead: leadConfig.stopAutofillOnLead === true,
      choiceDelay: options.choiceDelay, dataSaver: options.dataSaver, exitIps: new Set(),
      startupPhase: 'verify_ip', readRelayBytes: relay.readBytes,
    });
    session.bindRecordingContext(session.browser);
    session.exitIp = await verifyBrowserExitIp(session.browser, usedExitIps, onExitIp, websiteUrl, options.checkDuplicate);
    session.ownedExitIp = session.exitIp;
    if (session.exitIp !== geo.ip) throw new Error('IP trong Obscura khác IP đã dùng để cấu hình múi giờ; bỏ phiên.');
    session.verifiedExitIp = session.exitIp;
    session.exitIps.add(session.exitIp);
    session.ipVerified = true;
    session.onExitIpChanged = () => decorateGoLoginPages(session);
    await session.onExitIpChanged();
    if (shouldAbort()) throw new Error('Đã nhận Stop trong lúc xác minh Obscura.');
    session.assignedEmail = await takeNextEmail();
    activeBrowsers.add(session);
    pendingObscuraSessions.delete(session);
    session.resumeRuntime = () => initializeObscuraRuntime(session, options, true);
    await initializeObscuraRuntime(session, options);
    if (session.isClosed || shouldAbort()) throw new Error('Phiên Obscura đã bị hủy khi mở offer.');
    session.startupPhase = 'running';
    session.addBrowserLog({ type: 'obscura_started', detail: 'Obscura đã xác minh IP và gắn runtime.' });
    started = true;
    return { session, finalUrl: session.mainPage.url() };
  } catch (error) {
    startupSession.addBrowserLog?.({ type: 'obscura_start_failed', detail: `Không mở được Obscura: ${error.message}` });
    if (error.obscuraStopUnconfirmed) throw error;
    if (session) {
      session.suppressAutoRefill = true;
      try { await session.close(); }
      catch {
        error.obscuraStopUnconfirmed = true;
        throw error;
      }
    } else if (relay) { recordRelayUsage(relay.readBytes?.()); await relay.close(); }
    startupSession.finishRecording();
    throw error;
  }
}
