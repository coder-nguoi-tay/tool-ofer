import { activeBrowsers } from '../sessions.mjs';
import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { requestManagedProfileStop } from './request-managed-profile-stop.mjs';
import { connectGoLoginProfile } from '../gologin/connect-profile.mjs';
import { verifyGoLoginProfileIp } from '../gologin/verify-profile-ip.mjs';
import { attachGoLoginSessionLifecycle } from '../gologin/attach-session-lifecycle.mjs';
import { initializeGoLoginRuntime } from '../gologin/initialize-runtime.mjs';
import { configureGoLoginWindow } from '../gologin/configure-window.mjs';
import { startGoLoginSessionRecording, recordGoLoginStartupFailure } from '../gologin/start-session-recording.mjs';
import { getOfferUrlState } from '../tabs/get-offer-url-state.mjs';
import { recordGoLoginDeviceFingerprint } from '../gologin/record-device-fingerprint.mjs';
import { captureClickIds } from '../gologin/capture-click-ids.mjs';
import { normalizeIpAddress } from '../../lead-check/normalize-ip-address.mjs';
import { recordObservedExitIp } from '../../proxy/actions/record-observed-exit-ip.mjs';
import { attachMaxRunTimer } from './attach-max-run-timer.mjs';
import { takeNextEmail } from '../../queues/email.mjs';
import { assertNotMacPublicIp } from '../../proxy/actions/get-mac-public-ip.mjs';

/**
 * Ghi nhật ký từ trước SDK, ẩn ngay khi mở, xác minh IP rồi gắn runtime có thể nối lại CDP.
 * @param {object} options Profile, proxy đã khóa và cấu hình người dùng.
 * @return {Promise<object|null>} Phiên đã mở hoặc null khi nhận Stop.
 * @throws {Error} Lỗi mở/xác minh có log pha trước khi dừng profile.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function openGoLoginBrowser({
  slot, tileIndex, profileId, proxy, proxyKey = null, verifiedExitIp, websiteUrl, offer = 1,
  autofillRecords = [], autoSubmit = true, leadConfig = {}, scriptSteps = null, scriptPath = '',
  captchaApiKey = '', delayStop = 0, hideUntilTarget = false, hideUntilLead = false,
  screenPreviewOnly = false, deviceProfile = 'macos', deviceLabel = deviceProfile, userAgent = '', startProfile, stopProfile, deleteProfile = async () => true, adoptDetectedExitIp = () => false, shouldAbort = () => false, maxRunMinutes = 0, completeText = '', relay = null, closeRelay = async () => {}, renameProfile = async () => true,
  offerUrls = [], choiceDelay = 0, dataSaver = true, startupSession = null
}) {
  const session = Object.assign(startupSession || {}, {
    slot, tileIndex: tileIndex ?? slot - 1, profileId, isManagedProfile: true, isGoLogin: true,
    proxy, proxyKey, proxyServer: proxy.server, exitIp: verifiedExitIp,
    websiteUrl, offer, offerNumber: offer, streamRole: offer,
    userAgent, deviceProfile, deviceVersion: deviceLabel, deviceSummary: startupSession?.deviceSummary || `${deviceLabel} · GoLogin Orbita`, chromeVersion: startupSession?.chromeVersion || 'Orbita',
    enableLeadCheck: leadConfig.enabled === true,
    stopAutofillOnLead: leadConfig.enabled === true && leadConfig.stopAutofillOnLead === true,
    confirmedLeadIp: null, leadCheckStatus: null, suppressAutoRefill: false,
    choiceDelay, dataSaver, hideUntilTarget, hideUntilLead, inAppPreview: screenPreviewOnly,
    trueHeadless: screenPreviewOnly, isWindowVisible: !screenPreviewOnly && !hideUntilTarget && !hideUntilLead,
    bandwidthBytes: 0, bytesSent: 0, bytesReceived: 0, requestCount: 0,
    // Byte thật qua relay (như Chrome); /bandwidth/stats đọc trực tiếp khi phiên đang chạy.
    readRelayBytes: relay?.readBytes,
  });
  session.updateBadge = text => { session.badgeText = text; };
  if (!session.recordingId) startGoLoginSessionRecording(session);
  const options = { autofillRecords, autoSubmit, leadConfig, scriptSteps, scriptPath, captchaApiKey, offerUrls, completeText };
  let connected;
  try {
    const connectOptions = { onPhase: phase => { session.startupPhase = phase; }, onFailure: error => recordGoLoginStartupFailure(session, error) };
    connected = await connectGoLoginProfile(startProfile, stopProfile, connectOptions);
    session._stopProfile = async () => {
      if (session.isGoLoginProcessAlive?.()) session.addBrowserLog?.({ type: 'gologin_close_requested', detail: 'App yêu cầu dừng tiến trình Orbita của phiên.' });
      session._gologinStopRequested = true;
      await stopProfile(connected.gl);
      session._gologinProfileStopped = true;
      // Orbita đã dừng: ghi byte thật qua relay vào thống kê băng thông rồi đóng relay.
      await closeRelay();
      // Chỉ xóa khi Orbita đã dừng (stopProfile ném lỗi thì giữ profile để không xóa dưới browser còn sống).
      const deleted = await deleteProfile();
      session.addBrowserLog?.(deleted
        ? { type: 'gologin_profile_deleted', detail: 'Đã xóa profile GoLogin của phiên; lần chạy sau tạo profile mới.' }
        : { type: 'gologin_profile_delete_failed', detail: 'Không xóa được profile GoLogin của phiên; cần xóa tay trên GoLogin.' });
    };
    // IP app = IP đọc trong Orbita. Múi giờ Orbita khoá từ lúc khởi động (CDP không đổi được), nên lệch với IP app thì
    // khởi động lại Orbita đúng múi giờ của IP đó; proxy vẫn đổi IP mỗi kết nối nên kiểm lại sau mỗi lần.
    session.startupPhase = 'verify_ip';
    let probe = await probeAppIp(connected.context, verifiedExitIp);
    for (let restart = 1; isGeoMismatch(probe.geo, connected.gl._tz); restart++) {
      if (restart > GEO_RESTART_LIMIT) {
        throw Object.assign(new Error(`Múi giờ Orbita vẫn lệch IP ${probe.ip} sau ${GEO_RESTART_LIMIT} lần khởi động lại; bỏ proxy này, không mở offer.`), { code: 'GOLOGIN_GEO_MISMATCH' });
      }
      session.addBrowserLog({ type: 'gologin_geo_restart', ip: probe.ip,
        detail: `Múi giờ ${connected.gl._tz?.timezone || '?'} lệch IP app ${probe.ip} (${probe.geo.timezone}); khởi động lại Orbita đúng múi giờ (lần ${restart}).` });
      const nextGeo = probe.geo;
      await connected.browser.close().catch(() => {});
      await stopProfile(connected.gl);
      connected = await connectGoLoginProfile(() => startProfile(nextGeo), stopProfile, connectOptions);
      probe = await probeAppIp(connected.context, verifiedExitIp);
    }
    if (!probe.geo) session.addBrowserLog({ type: 'gologin_geo_unverified', detail: 'Không đọc được múi giờ của đúng IP trong Orbita; giữ múi giờ lúc khởi động.' });
    session.orbitaClientHints = probe.hints;
    session.ipGeo = probe.geo;
    if (!probe.mismatch) {
      session.exitIp = probe.ip;
    } else {
      const error = probe.mismatch;
      if (!adoptDetectedExitIp(error.detectedIp)) throw error;
      session.exitIp = error.detectedIp;
      session.addBrowserLog({ type: 'gologin_exit_ip_changed', expectedExitIp: verifiedExitIp, actualExitIp: error.detectedIp,
        detail: `Proxy đã đổi IP ${verifiedExitIp} → ${error.detectedIp}; IP mới chưa dùng cho offer này nên tiếp tục bằng IP trong Orbita.` });
    }
    // Tập IP của phiên: IP Orbita đang dùng và IP lúc app kiểm proxy (cùng session sticky nhưng có thể khác IP).
    session.exitIps = new Set([normalizeIpAddress(session.exitIp)].filter(Boolean));
    await recordObservedExitIp(session, verifiedExitIp);
    // Proxy hỏng hoặc trong suốt: Orbita ra Internet bằng IP thật của Mac thì dừng phiên, không mở offer.
    await assertNotMacPublicIp(session.exitIp);
    // Tên profile trên GoLogin ghi đúng IP app hiển thị; IP phiên đổi về sau (vd. lead khớp clickid) thì đổi tên theo.
    session.onExitIpChanged = ip => void renameProfile(ip).then(renamed => {
      if (!renamed) session.addBrowserLog?.({ type: 'gologin_device_error', detail: `Không đổi được tên profile GoLogin theo IP ${ip}.` });
    });
    session.onExitIpChanged(session.exitIp);
    const { context, browser, gl } = connected;
    session.browser = context; session._cdpBrowser = browser; session.browserWebSocketUrl = connected.wsUrl;
    session._gologinProcess = gl.processSpawned;
    captureClickIds(session, context);
    session.bindRecordingContext(context);
    attachGoLoginSessionLifecycle(session, delayStop, async replacement => {
      const previous = getOfferUrlState(session.browser);
      const next = getOfferUrlState(replacement.context);
      previous.opened.forEach(url => next.opened.add(url));
      previous.pending.forEach(url => next.opened.add(url));
      session.browser = replacement.context; session._cdpBrowser = replacement.browser;
      captureClickIds(session, replacement.context);
      session.bindRecordingContext(replacement.context);
      await initializeGoLoginRuntime(session, options, true);
    });
    session.mainPage = context.pages().find(page => !page.isClosed()) || await context.newPage();
    session.startupPhase = 'window_setup';
    await configureGoLoginWindow(session, screenPreviewOnly || hideUntilTarget || hideUntilLead);
    if (autoRefill.stopRequested) {
      session.suppressAutoRefill = true;
      session.addBrowserLog({ type: 'gologin_close_requested', detail: 'Đã nhận Stop trong lúc khởi tạo GoLogin.' });
      await requestManagedProfileStop(session);
      session.finishRecording();
      return null;
    }
    session.ipVerified = true;
    // Launcher đã bỏ slot vì mở quá hạn: không cho phiên mở muộn vào danh sách đang chạy (sẽ thừa/chồng slot đã bù).
    if (shouldAbort()) throw createSlotTimeoutError();
    activeBrowsers.add(session);
    // Như Chrome: mỗi phiên lấy một email trong hàng email (autofill thay email của record bằng email này).
    const assignedEmail = await takeNextEmail();
    if (assignedEmail) session.assignedEmail = assignedEmail;
    session.startupPhase = 'runtime_setup';
    await initializeGoLoginRuntime(session, options);
    if (session.isClosed) return null;
    if (shouldAbort()) throw createSlotTimeoutError();
    session.startupPhase = 'running';
    await recordGoLoginDeviceFingerprint(session, gl);
    session.addBrowserLog({ type: 'gologin_started', detail: 'GoLogin đã xác minh IP và sẵn sàng thao tác.' });
    attachMaxRunTimer(session, maxRunMinutes);
    return session;
  } catch (error) {
    recordGoLoginStartupFailure(session, error);
    session.suppressAutoRefill = true;
    session.isClosed = true;
    activeBrowsers.delete(session);
    if (connected) {
      await requestManagedProfileStop(session);
      if (!session._gologinProfileStopped) error.goLoginStopUnconfirmed = true;
      await connected.browser.close().catch(() => {});
    }
    if (!error.goLoginStopUnconfirmed) session.finishRecording();
    throw error;
  }
}

/**
 * Lỗi cho phiên mở xong sau khi launcher đã bỏ slot vì quá hạn; luồng lỗi chung sẽ dừng Orbita và xoá profile.
 * @return {Error} Lỗi mã GOLOGIN_SLOT_TIMEOUT.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function createSlotTimeoutError() {
  return Object.assign(new Error('Slot mở quá hạn nên đã bị bỏ; dừng phiên mở muộn để không thừa hoặc chồng slot đã bù.'), { code: 'GOLOGIN_SLOT_TIMEOUT' });
}

// Lệch múi giờ thì khởi động lại tối đa 3 lần rồi bỏ proxy (mỗi lần ~4-5 giây). Đo thật: proxy xoay có thể đổi IP
// sang múi giờ khác ngay sau lần khởi động lại đầu, cần 2 lần mới khớp.
const GEO_RESTART_LIMIT = 3;

/**
 * Đọc IP app trong Orbita kèm múi giờ/quốc gia của chính IP đó và Client Hints gốc; IP lệch IP kiểm trước không ném lỗi
 * ở đây mà trả về để bước sau quyết định nhận IP mới hay bỏ.
 * @param {object} context Context Orbita.
 * @param {string} expectedIp IP launcher đã kiểm và khoá.
 * @return {Promise<{ip: string, geo: object|null, hints: object|null, mismatch: Error|null}>}
 * @throws {Error} Khi không đọc được IP trong Orbita.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
async function probeAppIp(context, expectedIp) {
  let geo = null, hints = null;
  try {
    const ip = await verifyGoLoginProfileIp(context, expectedIp, value => { hints = value; }, value => { geo = value; });
    return { ip, geo, hints, mismatch: null };
  } catch (error) {
    if (error.code !== 'GOLOGIN_IP_MISMATCH') throw error;
    return { ip: error.detectedIp, geo, hints, mismatch: error };
  }
}

/**
 * Múi giờ (và quốc gia) Orbita khởi động có khác IP app không; không đọc được geo thì không coi là lệch.
 * @param {object|null} geo Geo của IP app (đọc trong Orbita).
 * @param {object|undefined} launchGeo Geo SDK dùng lúc khởi động (gl._tz).
 * @return {boolean}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
function isGeoMismatch(geo, launchGeo) {
  if (!geo) return false;
  if (geo.timezone !== launchGeo?.timezone) return true;
  return Boolean(geo.country && launchGeo?.country && geo.country !== launchGeo.country);
}
