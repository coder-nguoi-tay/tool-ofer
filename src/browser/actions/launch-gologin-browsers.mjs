import { buildGoLoginLaunchOptions } from '../../gologin-profile/build-launch-options.mjs';
import { startGoLoginSessionRecording, recordGoLoginStartupFailure } from '../gologin/start-session-recording.mjs';
import { activeBrowsers } from '../sessions.mjs';
import { applicationState } from '../../runtime/application-state.mjs';
import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { maxAliveBrowsers } from '../../runtime/constants/max-alive-browsers.mjs';
import { activeExitIpLocks } from '../../runtime/constants/active-exit-ip-locks.mjs';
import { proxyQueue } from '../../runtime/constants/proxy-queue.mjs';
import { getGoLoginDeviceSettings } from '../../gologin-profile/get-device-settings.mjs';
import { selectGoLoginDevices } from '../../gologin-profile/select-devices.mjs';
import { parseProxyLine, safeNormalizeUrl } from '../../proxy/configuration.mjs';
import { checkProxyExitIp } from '../../proxy/actions/check-proxy-exit-ip.mjs';
import { isExitIpCurrentlyInUse } from '../../proxy/actions/is-exit-ip-currently-in-use.mjs';
import { isProxyCurrentlyActive } from '../../proxy/actions/is-proxy-currently-active.mjs';
import { acquireProxyLock } from '../../proxy/actions/acquire-proxy-lock.mjs';
import { releaseProxyLock } from '../../proxy/actions/release-proxy-lock.mjs';
import { readProxyUsageHistory } from '../../proxy/actions/read-proxy-usage-history.mjs';
import { isExitIpConsumed } from '../../proxy/actions/is-exit-ip-consumed.mjs';
import { createProxyUsageKey } from '../../proxy/actions/create-proxy-usage-key.mjs';
import { persistProxyUsageHistory } from '../../proxy/actions/persist-proxy-usage-history.mjs';
import { saveProxyQueue } from '../../proxy/actions/save-proxy-queue.mjs';
import { saveAutoRefillSettings } from '../../refill/actions/save-auto-refill-settings.mjs';
import { readGoLoginConfig } from '../../runtime/actions/read-gologin-config.mjs';
import { saveGoLoginConfig } from '../../runtime/actions/save-gologin-config.mjs';
import { buildGoLoginProfileRequest, buildGoLoginProfileName } from '../../gologin-profile/build-gologin-profile-request.mjs';
import { renameGoLoginProfile } from '../../gologin-profile/rename-gologin-profile.mjs';
import { createGoLoginProfile } from '../../gologin-profile/create-gologin-profile.mjs';
import { deleteGoLoginProfile } from '../../gologin-profile/delete-gologin-profile.mjs';
import { startGoLoginProfile } from '../../gologin-profile/start-gologin-profile.mjs';
import { stopGoLoginProfile } from '../../gologin-profile/stop-gologin-profile.mjs';
import { parseAutofillRecords } from '../../autofill/parse-autofill-records.mjs';
import { loadScript } from '../../../script.mjs';
import { openGoLoginBrowser } from './open-gologin-browser.mjs';
import { randomInt } from 'node:crypto';
import { resolveOrbitaFullVersion } from '../../gologin-profile/resolve-orbita-full-version.mjs';
import { pickGoLoginDeviceHardware } from '../../gologin-profile/pick-device-hardware.mjs';
import { fetchProxyGeo } from '../../gologin-profile/fetch-proxy-geo.mjs';
import { waitForStableProxyIp } from '../../proxy/actions/wait-for-stable-proxy-ip.mjs';
import { startAuthenticatedHttpRelay } from '../../relay/start-authenticated-http-relay.mjs';
import { recordRelayUsage } from '../../monitoring/bandwidth/record-relay-usage.mjs';

// Mỗi profile nhận ngẫu nhiên một bản Orbita 148–156; SDK tải đúng bản theo số Chrome trong UA (~190MB lần đầu).
// ponytail: danh sách tĩnh, 155 không có trên CDN Orbita (404); thêm số mới khi GoLogin phát hành.
const GOLOGIN_BROWSER_VERSIONS = ['148', '149', '150', '151', '152', '153', '154', '156'];
// ponytail: tối đa 10 lượt mở GoLogin cùng lúc (bằng hạn mức profile gói hiện tại); tăng khi máy/gói GoLogin chịu được.
const GOLOGIN_PARALLEL_LAUNCHES = 10;
// Mở bình thường 7–35 giây; cộng mọi giới hạn hợp lệ (kiểm IP, API, SDK, CDP, xác minh IP, trang offer) khoảng 2 phút.
// Quá hạn này là kẹt ở chỗ không có timeout: bỏ slot để lượt bù không treo cả hàng đợi. Phiên đã mở xong không bị tính.
const GOLOGIN_SLOT_LAUNCH_TIMEOUT_MS = 180_000;

/**
 * Cấp proxy/IP độc quyền, profile riêng và đúng offer cho từng phiên GoLogin; mở song song tối đa 10 phiên; giữ cấu hình khi bù.
 * @param {string} requestBody JSON lựa chọn từ giao diện.
 * @param {boolean} isAutomaticRefill True khi chỉ bù slot trống.
 * @param {number[]|null} assignedStreamRoles Offer được queue bù phân công.
 * @return {Promise<{results: string[], warnings: string[]}>} Phiên đã mở và các slot không thể cấp.
 * @throws {Error} Khi thiếu token, URL hoặc cấu hình/lịch sử không hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function launchGoLoginBrowsers(requestBody, isAutomaticRefill = false, assignedStreamRoles = null) {
  const body = JSON.parse(requestBody);
  const config = await readGoLoginConfig();
  const selectedDevices = selectGoLoginDevices(body, config);
  const apiToken = body.gologinToken || config.token;
  if (!apiToken) throw new Error('Chưa cấu hình GoLogin API Token.');
  if (body.gologinToken) await saveGoLoginConfig({ token: apiToken });
  delete body.gologinToken;
  const offerUrls = (body.offerUrls?.length ? body.offerUrls : [body.websiteUrl, body.websiteUrl2, body.websiteUrl3, body.websiteUrl4]).filter(Boolean);
  if (!offerUrls.length) throw new Error('Chưa nhập URL offer cho GoLogin.');
  for (const url of offerUrls) {
    if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error('URL offer phải dùng HTTP/HTTPS.');
  }
  const requestedCount = Math.min(maxAliveBrowsers, Math.max(1, Math.floor(Number(body.requestedCount ?? body.concurrency) || 1)));
  if (!isAutomaticRefill) {
    autoRefill.stopRequested = false;
    autoRefill.enabled = true;
    autoRefill.settings = { ...body, browserMode: 'GoLogin', useGoLogin: true, gologinDevices: selectedDevices };
    autoRefill.targetCount = Math.min(maxAliveBrowsers, Math.max(autoRefill.targetCount, activeBrowsers.size + requestedCount));
    await saveAutoRefillSettings();
  }
  // Như Chrome: ô Giới hạn = số phiên hoàn tất (Complete text) tối đa; đạt giới hạn thì không mở thêm.
  const newLimitRun = Math.max(0, Number(body.limitRun) || 0);
  if (newLimitRun > 0) applicationState.limitRunMax = newLimitRun;
  const delayStart = Math.max(0, Number(body.delayStart) || 0); // giây chờ trước mỗi lần mở, như Chrome
  const proxyLines = String(body.proxyList || '').trim()
    ? String(body.proxyList).split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    : [...proxyQueue.available];
  const history = await readProxyUsageHistory();
  const records = body.autofillData ? parseAutofillRecords(body.autofillData) : [];
  const scriptSteps = body.scriptPath ? await loadScript(body.scriptPath) : null;
  const results = [], warnings = [];
  let proxyCursor = 0, nextIndex = 0, stopBatch = false;
  // Slot đã cấp cho lượt mở đang chạy song song nhưng chưa vào activeBrowsers.
  const reservedSlots = new Set();
  /**
   * Mở một phiên: giữ slot, cấp proxy/IP độc quyền, tạo profile và khởi chạy Orbita.
   * @param {number} index Thứ tự phiên trong lượt mở (quyết định offer).
   * @return {Promise<string|undefined>} 'stop' khi cả lượt phải dừng (Stop, hết proxy, hết hạn mức profile).
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-14
   */
  const launchOne = async index => {
    if (autoRefill.stopRequested || isAutomaticRefill && autoRefill.noSlotRefill) return 'stop';
    if (activeBrowsers.size + reservedSlots.size >= maxAliveBrowsers) return 'stop';
    if (applicationState.limitRunMax > 0 && applicationState.limitRunCount >= applicationState.limitRunMax) {
      warnings.push(`Đã đạt giới hạn ${applicationState.limitRunMax} phiên hoàn tất; dừng mở thêm.`);
      return 'stop';
    }
    const occupied = new Set([...[...activeBrowsers].map(session => session.slot), ...reservedSlots]);
    let slot = 1;
    while (occupied.has(slot)) slot++;
    const offer = assignedStreamRoles?.[index] ?? index % offerUrls.length + 1;
    const websiteUrl = offerUrls[offer - 1];
    if (!websiteUrl) { warnings.push(`Slot ${slot}: Offer ${offer} không có URL.`); return; }
    reservedSlots.add(slot);
    // Slot giữ chỗ tới khi lượt mở thật sự kết thúc, kể cả khi đã bị bỏ vì quá hạn.
    const attempt = { abandoned: false, startupSession: null };
    const work = launchInSlot(slot, offer, websiteUrl, attempt).finally(() => reservedSlots.delete(slot));
    let timer;
    const expired = new Promise(resolve => { timer = setTimeout(() => resolve('timeout'), GOLOGIN_SLOT_LAUNCH_TIMEOUT_MS); });
    const outcome = await Promise.race([work, expired]);
    clearTimeout(timer);
    if (outcome !== 'timeout') return outcome;
    // Bỏ slot kẹt: lượt bù đi tiếp; khoá proxy/IP giữ tới khi lượt kẹt kết thúc, phiên mở muộn tự bị dừng và xoá profile.
    attempt.abandoned = true;
    const phase = attempt.startupSession?.startupPhase || 'proxy_check';
    const detail = `Slot ${slot} mở quá ${GOLOGIN_SLOT_LAUNCH_TIMEOUT_MS / 60000} phút, kẹt ở pha ${phase}; bỏ slot này để tiếp tục bù slot khác.`;
    attempt.startupSession?.addBrowserLog?.({ type: 'slot_launch_timeout', detail });
    console.warn(`[GoLogin] ${detail}`);
    warnings.push(detail);
  };
  /**
   * Phần mở phiên sau khi đã giữ slot.
   * @param {number} slot Slot đã giữ.
   * @param {number} offer Offer được phân công.
   * @param {string} websiteUrl URL offer.
   * @return {Promise<string|undefined>} 'stop' khi cả lượt phải dừng.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-14
   */
  /**
   * Ghi một mục lịch sử proxy trên bản đọc mới nhất, để không ghi đè mục phiên khác vừa ghi (IP phụ, kết quả đóng phiên).
   * @param {string} key Khoá mục lịch sử.
   * @param {Function} update Nhận mục hiện có, trả mục mới.
   * @return {Promise<void>} Đã ghi lịch sử.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-14
   */
  const writeUsage = async (key, update) => {
    const latest = await readProxyUsageHistory().catch(() => history);
    latest.proxies[key] = update(latest.proxies[key]);
    Object.assign(history.proxies, latest.proxies);
    await persistProxyUsageHistory(latest);
  };
  // Phiên đã ghi kết quả (trùng IP, hoàn tất...) trong lúc mở thì giữ kết quả đó, không ghi đè.
  const keepOutcome = (entry, next) => entry?.status && entry.status !== 'attempting' ? { ...entry, exitIp: entry.exitIp || next.exitIp } : { ...entry, ...next };
  /**
   * Chuyển dòng proxy sang "đã dùng": proxy giữ IP cố định nên dòng chết/không ổn định/lỗi proxy mà để lại hàng thì lượt
   * bù sau lại chọn đúng nó đầu tiên và lỗi y hệt (đã thấy một dòng bị thử lại 4 lần, mỗi lần ~30 giây).
   * @param {string} line Dòng proxy trong hàng.
   * @return {Promise<void>}
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-15
   */
  const retireProxyLine = async line => {
    const index = proxyQueue.available.indexOf(line);
    if (index === -1) return;
    proxyQueue.used.push(...proxyQueue.available.splice(index, 1));
    await saveProxyQueue();
  };
  const launchInSlot = async (slot, offer, websiteUrl, attempt = { abandoned: false }) => {
    let proxy = null, exitIp = null, profileId = null, proxyLine = null, usageKey = null;
    // Như Chrome: proxy HTTP có auth đi qua relay cục bộ để đếm byte thật tại socket (711 tính theo byte thật).
    let relay = null, relayClosing = null;
    const closeRelay = () => relayClosing ||= relay ? (async () => {
      recordRelayUsage(relay.readBytes());
      await relay.close().catch(() => {});
    })() : Promise.resolve();
    const deviceProfile = selectedDevices[(slot - 1) % selectedDevices.length];
    // Fingerprint không phụ thuộc proxy: lấy song song với lúc kiểm IP thay vì chờ kiểm xong.
    const hardwareLookup = pickGoLoginDeviceHardware(apiToken, deviceProfile).catch(() => null);
    let geoLookup = Promise.resolve(null);
    let keepResourceLocks = false;
    let startupSession, deletion = null;
    // Mỗi phiên một profile mới; xóa đúng một lần sau khi Orbita đã dừng để không trộn dấu vết giữa các IP.
    const deleteProfile = () => deletion ||= deleteGoLoginProfile(apiToken, profileId);
    const isUsableExitIp = ip => Boolean(ip) && !isExitIpCurrentlyInUse(ip) && !(body.checkDuplicate !== false && Object.values(history.proxies).some(entry =>
      entry.exitIp === ip && isExitIpConsumed(entry) && safeNormalizeUrl(entry.websiteUrl || '') === safeNormalizeUrl(websiteUrl)));
    /**
     * Proxy "sticky" vẫn có thể đổi IP giữa lúc kiểm tra và lúc Orbita kết nối; IP trong browser mới là IP offer thấy.
     * @param {string} detectedIp IP đọc được trong Orbita.
     * @return {boolean} True khi đã chuyển khóa sang IP mới; false khi IP đang dùng/đã dùng cho offer này.
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-11-14
     */
    const adoptDetectedExitIp = detectedIp => {
      if (!isUsableExitIp(detectedIp)) return false;
      activeExitIpLocks.delete(exitIp); activeExitIpLocks.add(detectedIp);
      exitIp = detectedIp;
      return true;
    };
    while (proxyCursor < proxyLines.length) {
      proxyLine = proxyLines[proxyCursor++];
      const candidate = parseProxyLine(proxyLine, proxyCursor, body.proxyType || 'socks5');
      if (!candidate || isProxyCurrentlyActive(candidate)) continue;
      acquireProxyLock(candidate);
      // Session proxy mới đổi IP 2 lần trong ~10 giây đầu rồi mới giữ cố định: chờ IP ổn định rồi mới kiểm trùng, khoá,
      // lấy múi giờ và mở Orbita, để IP khoá = IP trình duyệt dùng = IP trang offer thấy. Mỗi lần tra lấy IP kèm múi giờ
      // của chính IP đó (geo.myip.link); dịch vụ đó lỗi thì tra IP thường.
      const stable = await waitForStableProxyIp(candidate, async () => {
        const geo = await fetchProxyGeo(candidate).catch(() => null);
        if (geo?.ip) return { ip: geo.ip, geo };
        const ip = await checkProxyExitIp(candidate);
        return ip ? { ip, geo: null } : null;
      });
      const candidateIp = stable?.ip || null;
      const candidateGeo = Promise.resolve(stable?.geo || null);
      if (!isUsableExitIp(candidateIp)) {
        releaseProxyLock(candidate);
        // Proxy chết hoặc IP không ổn định thì bỏ hẳn; IP trùng/đang dùng thì giữ dòng (offer khác vẫn có thể dùng).
        if (!stable) await retireProxyLine(proxyLine);
        continue;
      }
      activeExitIpLocks.add(candidateIp);
      proxy = candidate; exitIp = candidateIp; geoLookup = candidateGeo;
      break;
    }
    if (!proxy) { warnings.push(`Slot ${slot}: Không còn proxy/IP hợp lệ; không mở bằng IP trực tiếp.`); return 'stop'; }
    try {
      if (autoRefill.stopRequested || isAutomaticRefill && autoRefill.noSlotRefill) return 'stop';
      if (delayStart > 0) {
        await new Promise(resolve => setTimeout(resolve, delayStart * 1000));
        if (autoRefill.stopRequested || isAutomaticRefill && autoRefill.noSlotRefill) return 'stop';
      }
      // Khoá riêng cho lượt mở này, cũng là session.proxyKey để kết quả đóng phiên (trùng IP, hoàn tất...) ghi đúng mục.
      usageKey = `${createProxyUsageKey(proxy, 1, websiteUrl)}:${slot}-${Date.now().toString(36)}`;
      await writeUsage(usageKey, () => ({ status: 'attempting', exitIp, proxy: proxy.server, username: proxy.username ?? '',
        websiteUrl, offerNumber: offer, attemptedAt: new Date().toISOString() }));
      const browserVersion = await resolveOrbitaFullVersion(GOLOGIN_BROWSER_VERSIONS[randomInt(GOLOGIN_BROWSER_VERSIONS.length)]);
      const hardware = await hardwareLookup;
      if (proxy.username && !proxy.server.startsWith('socks5://')) relay = await startAuthenticatedHttpRelay(proxy);
      // Profile Orbita trỏ vào relay (không auth); khoá proxy, kiểm IP và lead vẫn dùng proxy gốc.
      const profileRequest = buildGoLoginProfileRequest({ slot, proxy: relay ? relay.proxy : proxy, exitIp, deviceProfile, browserVersion, hardware });
      const deviceLabel = hardware?.deviceVariant?.deviceVersion || getGoLoginDeviceSettings(deviceProfile).label;
      const gpu = profileRequest.webGLMetadata.renderer?.replace(/^ANGLE \((?:[^,]+, )?/, '').replace(/ \(0x[0-9A-F]+\)| Direct3D.*| vs_.*|, Unspecified.*|\)$/gi, '');
      startupSession = { slot, tileIndex: slot - 1, exitIp, proxy, websiteUrl, offerNumber: offer, isGoLogin: true, browserVersion,
        chromeVersion: getGoLoginDeviceSettings(deviceProfile).appleMobile ? 'Orbita' : `Orbita ${browserVersion}`, startupPhase: 'profile_create',
        deviceVariant: hardware?.deviceVariant || null,
        mobileScreen: profileRequest.screenWidth ? { width: profileRequest.screenWidth, height: profileRequest.screenHeight, devicePixelRatio: profileRequest.devicePixelRatio } : null,
        deviceSummary: `${deviceLabel} · ${gpu} · ${profileRequest.navigator.hardwareConcurrency} nhân · ${profileRequest.navigator.resolution} · GoLogin Orbita` };
      if (!hardware) startupSession.deviceHardwareFallback = true;
      attempt.startupSession = startupSession;
      startGoLoginSessionRecording(startupSession);
      if (startupSession.deviceHardwareFallback) startupSession.addBrowserLog({ type: 'gologin_device_error', detail: 'Không lấy được fingerprint GoLogin; dùng phần cứng mặc định của thiết bị.' });
      profileId = await createGoLoginProfile(apiToken, profileRequest);
      const timezone = await geoLookup;
      if (attempt.abandoned) throw Object.assign(new Error('Slot mở quá hạn nên đã bị bỏ trước khi bật Orbita.'), { code: 'GOLOGIN_SLOT_TIMEOUT' });
      const session = await openGoLoginBrowser({
        startupSession, slot, tileIndex: slot - 1, profileId, proxy, proxyKey: usageKey, relay, closeRelay,
        renameProfile: ip => renameGoLoginProfile(apiToken, profileId, buildGoLoginProfileName({ slot, osLabel: getGoLoginDeviceSettings(deviceProfile).label, versionNum: String(browserVersion).split('.')[0], ip })), verifiedExitIp: exitIp, websiteUrl, offer,
        autofillRecords: records, autoSubmit: body.autoSubmitForm !== false,
        leadConfig: { enabled: body.enableLeadCheck === true, stopAutofillOnLead: body.stopAutofillOnLead === true,
          autoCloseNoLead: body.autoCloseNoLead !== false,
          apiUrl: body.leadCheckApiUrl, cookie: body.leadCheckCookie, datas: body.leadCheckDatas,
          intervalSeconds: Number(body.leadCheckInterval) || 30, maxAttempts: Number(body.leadCheckMaxAttempts) || 2 },
        scriptSteps, scriptPath: body.scriptPath || '', captchaApiKey: body.captchaApiKey || '',
        hideUntilTarget: Boolean(body.hideUntilTarget ?? body.hideBrowser), hideUntilLead: Boolean(body.hideUntilLead),
        totalCount: autoRefill.targetCount, screenPreviewOnly: Boolean(body.screenPreviewOnly ?? body.runInApp ?? true),
        deviceProfile, deviceLabel, userAgent: profileRequest.navigator.userAgent, delayStop: Math.max(0, Number(body.delayStop) || 0),
        deleteProfile, adoptDetectedExitIp, shouldAbort: () => attempt.abandoned, maxRunMinutes: Number(body.maxRunMinutes) || 0, completeText: String(body.completeText || '').trim(), startProfile: appGeo => startGoLoginProfile(apiToken, profileId, { ...buildGoLoginLaunchOptions({ screenPreviewOnly: Boolean(body.screenPreviewOnly ?? body.runInApp ?? true), hideUntilTarget: body.hideUntilTarget ?? body.hideBrowser, hideUntilLead: body.hideUntilLead, mobileScreen: profileRequest.os === 'android' ? startupSession.mobileScreen : undefined }), ...((appGeo || timezone) ? { timezone: appGeo || timezone } : {}) }, error => recordGoLoginStartupFailure(startupSession, error)), stopProfile: gl => stopGoLoginProfile(gl),
        offerUrls: body.multiTab === false ? [websiteUrl] : [websiteUrl, ...offerUrls],
        choiceDelay: body.enableChoiceDelay !== false ? Math.max(0, Number(body.choiceDelay) || 0) : 0,
        dataSaver: body.dataSaver !== false
      });
      if (!session) {
        await closeRelay();
        await writeUsage(usageKey, entry => keepOutcome(entry, { status: 'failed', reason: 'Đã dừng khi đang khởi tạo', completedAt: new Date().toISOString() }));
        return;
      }
      await writeUsage(usageKey, entry => keepOutcome(entry, { status: 'success', exitIp, time: new Date().toISOString() }));
      await retireProxyLine(proxyLine);
      results.push(`Slot ${slot}: GoLogin đã mở Offer ${offer}.`);
    } catch (error) {
      keepResourceLocks = error.goLoginStopUnconfirmed === true;
      // Orbita chưa chắc đã dừng thì giữ relay như giữ khoá proxy/IP; còn lại đóng và ghi byte đã dùng.
      if (!keepResourceLocks) await closeRelay();
      if (usageKey) await writeUsage(usageKey, entry => keepOutcome(entry, { status: 'failed', exitIp, reason: error.message, completedAt: new Date().toISOString() })).catch(() => {});
      if (profileId && !keepResourceLocks && !await deleteProfile()) startupSession?.addBrowserLog?.({ type: 'gologin_profile_delete_failed', detail: 'Không xóa được profile GoLogin của lượt mở lỗi.' });
      if (startupSession) {
        recordGoLoginStartupFailure(startupSession, error);
        if (!keepResourceLocks) startupSession.finishRecording();
      }
      const profileLimitReached = error.code === 'GOLOGIN_PROFILE_LIMIT';
      // Hết hạn mức profile không phải lỗi proxy: giữ dòng để lượt sau dùng; lỗi khác thì bỏ dòng, tránh thử lại mãi.
      if (!profileLimitReached) await retireProxyLine(proxyLine).catch(() => {});
      warnings.push(`Slot ${slot}: ${profileLimitReached ? 'GoLogin đã đủ số profile tối đa của gói (HTTP 403); xóa bớt profile trên GoLogin hoặc giảm số luồng.' : error.message}`);
      // Các slot còn lại cũng sẽ bị 403; dừng lượt này, lượt bù sau tự thử lại khi phiên đóng và profile được xóa.
      if (profileLimitReached) return 'stop';
    } finally {
      if (!keepResourceLocks && ![...activeBrowsers].some(session => session.isGoLogin && session.profileId === profileId)) {
        releaseProxyLock(proxy, exitIp);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(GOLOGIN_PARALLEL_LAUNCHES, requestedCount) }, async () => {
    while (!stopBatch && nextIndex < requestedCount) {
      if (await launchOne(nextIndex++) === 'stop') stopBatch = true;
    }
  }));
  return { results, warnings };
}
