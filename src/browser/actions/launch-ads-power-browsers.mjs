import { DEFAULT_LEAD_CONFIG } from '../../../lead-check.mjs';
import { isExitIpConsumed } from '../../proxy/actions/is-exit-ip-consumed.mjs';
import { DEVICE_PROFILES } from '../../runtime/constants/device-profiles.mjs';
import { acquireProxyLock } from '../../proxy/actions/acquire-proxy-lock.mjs';
import { activeBrowsers } from '../sessions.mjs';
import { activeExitIpLocks } from '../../runtime/constants/active-exit-ip-locks.mjs';
import { applicationState } from '../../runtime/application-state.mjs';
import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { buildAdsPowerProfileRequest } from '../../../adspower-profile.mjs';
import { checkProxyExitIp } from '../../proxy/actions/check-proxy-exit-ip.mjs';
import { cleanupOrphanedAdsPowerProfiles } from '../../../adspower-profile.mjs';
import { createProxyUsageKey } from '../../proxy/actions/create-proxy-usage-key.mjs';
import { deleteAdsPowerProfile } from '../../../adspower-profile.mjs';
import { getOrCreateAdsPowerProfile } from '../../../adspower-profile.mjs';
import { importAutofillRecords } from '../../records/actions/import-autofill-records.mjs';
import { isExitIpCurrentlyInUse } from '../../proxy/actions/is-exit-ip-currently-in-use.mjs';
import { isProxyCurrentlyActive } from '../../proxy/actions/is-proxy-currently-active.mjs';
import { listInstalledAdsPowerKernelVersions } from '../../../adspower-profile.mjs';
import { loadScript } from '../../../script.mjs';
import { maxAliveBrowsers } from '../../runtime/constants/max-alive-browsers.mjs';
import { offerStrategyState } from '../../runtime/constants/offer-strategy-state.mjs';
import { openAdsPowerBrowser } from './open-ads-power-browser.mjs';
import { parseAutofillRecords } from '../../../autofill.mjs';
import { parseProxyLine } from '../../proxy/configuration.mjs';
import { persistProxyUsageHistory } from '../../proxy/actions/persist-proxy-usage-history.mjs';
import { proxyIdentity } from '../../runtime/actions/proxy-identity.mjs';
import { proxyQueue } from '../../runtime/constants/proxy-queue.mjs';
import { pruneDeadManagedSessions } from '../../runtime/actions/prune-dead-managed-sessions.mjs';
import { readAdsPowerApiKey } from '../../runtime/actions/read-ads-power-api-key.mjs';
import { readProxyUsageHistory } from '../../proxy/actions/read-proxy-usage-history.mjs';
import { releaseProxyLock } from '../../proxy/actions/release-proxy-lock.mjs';
import { safeNormalizeUrl } from '../../proxy/configuration.mjs';
import { saveAutoRefillSettings } from '../../refill/actions/save-auto-refill-settings.mjs';
import { saveAutofillQueue } from '../../records/actions/save-autofill-queue.mjs';
import { saveProxyQueue } from '../../proxy/actions/save-proxy-queue.mjs';
import { selectAdsPowerKernelVersions } from '../../../adspower-profile.mjs';
import { startAdsPowerProfile } from '../../../adspower-profile.mjs';
import { stopAdsPowerProfile } from '../../../adspower-profile.mjs';

/**
 * Tạo profile AdsPower riêng cho từng luồng rồi khởi chạy SunBrowser.
 *
 * @param {string} requestBody JSON từ giao diện Mac 2.
 * @param {boolean} isAutomaticRefill Giữ mục tiêu và cấu hình gốc khi chỉ bù slot trống.
 * @param {number[]|null} assignedStreamRoles Offer đã được bộ bù slot phân chia.
 * @return {Promise<{results: object[], warnings: string[]}>} Kết quả mở các slot.
 * @throws {Error} Khi thiếu API key hoặc không thể chuẩn bị profile.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function launchAdsPowerBrowsers(requestBody, isAutomaticRefill = false, assignedStreamRoles = null) {
  const body = JSON.parse(requestBody);
  const apiToken = await readAdsPowerApiKey();
  if (!apiToken) throw new Error('Nhập AdsPower API key trong Settings > Browser trước khi chạy.');
  const installedAdsPowerKernelVersions = await listInstalledAdsPowerKernelVersions();
  if (!isAutomaticRefill) {
    autoRefill.stopRequested = false;
    autoRefill.enabled = true;
  }
  const concurrency = Math.min(maxAliveBrowsers, parseInt(body.requestedCount ?? body.concurrency) || 1);
  const websiteUrl = body.websiteUrl || '';
  const offerUrls = body.offerUrls || (body.websiteUrl3 || body.websiteUrl4 || body.websiteUrl2 ? [body.websiteUrl, body.websiteUrl2, body.websiteUrl3, body.websiteUrl4].filter(Boolean) : [websiteUrl].filter(Boolean));
  const multiTab = body.multiTab !== false; // Mặc định chạy đa luồng là đa tab trong 1 trình duyệt
  const useCloakBrowser = Boolean(body.useCloakBrowser ?? body.cloakBrowser);
  const screenPreviewOnly = Boolean(body.screenPreviewOnly ?? body.runInApp ?? true); // "Chạy trong app": false = mở cửa sổ thường

  // Lưu mục tiêu của lượt Start; lần bù chỉ mở số slot còn thiếu.
  if (!isAutomaticRefill) {
    autoRefill.settings = {
      ...body,
      browserMode: 'AdsPower',
      screenPreviewOnly,
      useCloakBrowser
    };
    autoRefill.targetCount = concurrency;
    void saveAutoRefillSettings();
  }

  // Tự động dọn dẹp các profile tạm mồ côi trước khi mở slot để không chạm hạn mức 12 profile
  const activeProfileIds = new Set([...activeBrowsers].map(s => s.profileId).filter(Boolean));
  await cleanupOrphanedAdsPowerProfiles(apiToken, activeProfileIds, fetch, 10).catch(() => {});

  // Parse autofill/script params giống launchRequestedBrowsers
  const scriptPath = body.scriptPath ?? '';
  const captchaApiKey = body.captchaApiKey ?? '';
  const completeText = body.completeText ?? '';
  const timeLimit = Math.max(0, Number(body.timeLimit) || 0);
  const delayStart = Math.max(0, Number(body.delayStart) || 0);
  const delayStop = Math.max(0, Number(body.delayStop) || 0);
  const antiFingerprint = {
    canvas: Boolean(body.antiFpCanvas),
    clientRects: Boolean(body.antiFpClientRects),
    webgl: Boolean(body.antiFpWebgl),
    webrtc: Boolean(body.antiFpWebrtc),
    fonts: Boolean(body.antiFpFonts),
    apiFakeIP: Boolean(body.antiFpApiFakeIP)
  };
  const enabledDeviceProfiles = [body.Windows && 'windows', body.Mac && 'macos', body.Linux && 'linux', body.Android && 'android', body.iPhone && 'ios', body.iPad && 'ipad'].filter(Boolean);
  if (enabledDeviceProfiles.length === 0) enabledDeviceProfiles.push('macos');
  let scriptSteps = null;
  if (scriptPath) {
    try {
      scriptSteps = await loadScript(scriptPath);
    } catch {}
  }
  const autofillRecords = parseAutofillRecords(body.autofillData);
  if (autofillRecords.length > 0) {
    const added = importAutofillRecords(autofillRecords);
    if (added > 0) await saveAutofillQueue();
  }
  const leadConfig = {
    enabled: body.enableLeadCheck === true,
    apiUrl: body.leadCheckApiUrl || DEFAULT_LEAD_CONFIG.apiUrl,
    cookie: body.leadCheckCookie || DEFAULT_LEAD_CONFIG.cookie,
    datas: body.leadCheckDatas || DEFAULT_LEAD_CONFIG.datas,
    intervalSeconds: Number(body.leadCheckInterval) || DEFAULT_LEAD_CONFIG.intervalSeconds,
    maxAttempts: Number(body.leadCheckMaxAttempts) || DEFAULT_LEAD_CONFIG.maxAttempts,
    checkScreen: Number(body.leadCheckScreen) || DEFAULT_LEAD_CONFIG.checkScreen || 4,
    autoCloseNoLead: body.autoCloseNoLead !== false
  };
  const hideUntilTarget = Boolean(body.hideUntilTarget ?? body.hideBrowser);
  const hideUntilLead = Boolean(body.hideUntilLead);

  // Dọn dẹp các session cũ đã đóng hoặc zombie trước khi khởi chạy
  await pruneDeadManagedSessions();
  const count = concurrency;
  const results = [],
    warnings = [];

  // Thu thập proxy: ưu tiên từ request (txtDashboardProxy), bỏ qua proxy đã dùng
  const candidateProxies = [];
  const hasProxyInput = Boolean(body.proxyList?.trim() || proxyQueue.available.length);
  const proxyType = body.proxyType ?? 'socks5';
  const usedProxyLines = new Set(proxyQueue.used.map(l => l.trim()));
  const candidatePoolTarget = Math.max(count * 3, count + 20);
  if (body.proxyList) {
    for (const [i, line] of body.proxyList.split(/\r?\n/).entries()) {
      if (candidateProxies.length >= candidatePoolTarget) break;
      if (usedProxyLines.has(line.trim())) continue;
      try {
        const p = parseProxyLine(line, i + 1, proxyType);
        if (p && !candidateProxies.some(existingProxy => proxyIdentity(existingProxy) === proxyIdentity(p))) {
          candidateProxies.push(p);
        }
      } catch {}
    }
  }

  // Nếu chưa đủ proxy cho các luồng, tự động rút từ proxyQueue.available
  if (candidateProxies.length < candidatePoolTarget) {
    for (const line of proxyQueue.available) {
      if (candidateProxies.length >= candidatePoolTarget) break;
      try {
        const p = parseProxyLine(line.trim(), candidateProxies.length + 1, proxyType);
        if (p && !isProxyCurrentlyActive(p) && !candidateProxies.some(existingProxy => proxyIdentity(existingProxy) === proxyIdentity(p))) {
          p._queueLine = line;
          candidateProxies.push(p);
        }
      } catch {}
    }
  }
  const usageHistory = await readProxyUsageHistory();
  const usedExitIps = new Set(Object.values(usageHistory.proxies).map(entry => {
    // Duplicate IP / offer không khả dụng vẫn là IP đã vào offer: không mở lại cho cùng trang đích.
    if (!isExitIpConsumed(entry)) return null;
    return entry.websiteUrl ? `${entry.exitIp}::${safeNormalizeUrl(entry.websiteUrl)}` : entry.exitIp;
  }).filter(Boolean));
  const managedWorkers = [];
  const occupiedSlots = new Set([...activeBrowsers].map(s => s.slot || s.tileIndex + 1));
  for (let i = 0; i < count; i++) {
    const offerNum = assignedStreamRoles?.[i] ?? i % Math.max(1, offerUrls.length) + 1;
    const slotOfferUrl = offerUrls[offerNum - 1] || websiteUrl;
    if (offerStrategyState.get(offerNum)?.mode === 'skip') {
      warnings.push(`Offer ${offerNum} được cấu hình bỏ qua; không cấp proxy hoặc mở trình duyệt.`);
      continue;
    }
    const normOfferUrl = slotOfferUrl ? safeNormalizeUrl(slotOfferUrl) : '';
    let slot = 1;
    while (occupiedSlots.has(slot)) slot++;
    occupiedSlots.add(slot);
    const tileIndex = slot - 1;
    let assignedProxy = null;
    let actualExitIp = null;

    // Duyệt qua candidateProxies để tìm một proxy sống và chưa bị trùng IP (tối đa 20 lần thử)
    let checkAttempts = 0;
    while (candidateProxies.length > 0 && checkAttempts++ < 20) {
      const candidate = candidateProxies.shift();
      if (isProxyCurrentlyActive(candidate)) continue;
      acquireProxyLock(candidate);
      let verifiedIp = null;
      try {
        verifiedIp = await checkProxyExitIp(candidate);
      } catch {}
      if (!verifiedIp) {
        // Proxy không kết nối được qua socks -> giải phóng để không dùng proxy chết
        releaseProxyLock(candidate);
        continue;
      }
      if (isExitIpCurrentlyInUse(verifiedIp)) {
        releaseProxyLock(candidate);
        warnings.push(`Proxy ${candidate.server} có IP exit (${verifiedIp}) đang chạy ở luồng khác; bỏ qua.`);
        continue;
      }
      const keyWithUrl = normOfferUrl ? `${verifiedIp}::${normOfferUrl}` : verifiedIp;
      if (body.checkDuplicate !== false && usedExitIps.has(keyWithUrl)) {
        releaseProxyLock(candidate);
        warnings.push(`Proxy ${candidate.server} có IP exit (${verifiedIp}) đã được dùng trước đây cho offer ${slotOfferUrl}; bỏ qua (Check duplicate).`);
        continue;
      }

      // Proxy sống và không trùng IP
      assignedProxy = candidate;
      actualExitIp = verifiedIp;
      activeExitIpLocks.add(verifiedIp);
      usedExitIps.add(keyWithUrl);
      break;
    }
    if (!assignedProxy && hasProxyInput) {
      warnings.push(`Slot ${slot}: Không còn proxy hợp lệ; không mở bằng IP thật của máy.`);
      continue;
    }
    if (!assignedProxy) {
      actualExitIp = 'Direct';
      const directKey = normOfferUrl ? `Direct::${normOfferUrl}` : 'Direct';
      if (isExitIpCurrentlyInUse('Direct')) {
        warnings.push(`Slot ${slot}: Đã có luồng chạy Direct (IP thật); dừng mở để tránh trùng IP.`);
        continue;
      }
      if (body.checkDuplicate !== false && usedExitIps.has(directKey)) {
        warnings.push(`Slot ${slot}: IP Direct (IP thật máy) đã được dùng trước đây cho offer này; dừng mở (Check duplicate).`);
        continue;
      }
      activeExitIpLocks.add('Direct');
      usedExitIps.add(directKey);
    }
    const chosenDeviceProfile = enabledDeviceProfiles[applicationState.deviceProfileRotationCounter % enabledDeviceProfiles.length];
    applicationState.deviceProfileRotationCounter += 1;
    managedWorkers.push({
      slot,
      tileIndex,
      assignedProxy,
      actualExitIp,
      slotOfferUrl,
      offerNum,
      deviceProfile: chosenDeviceProfile,
      threadCount: count,
      multiTab,
      offerUrls
    });
  }

  // Dùng cùng cách lọc phiên bản đang bận và xoay vòng như Chrome thường.
  const occupiedAdsPowerKernelVersions = new Set([...activeBrowsers].filter(session => session.isAdsPower && !session.isClosed).map(session => /SunBrowser (\d+)/.exec(session.chromeVersion || '')?.[1]).filter(Boolean));
  const availableAdsPowerKernelVersions = selectAdsPowerKernelVersions(installedAdsPowerKernelVersions, occupiedAdsPowerKernelVersions, applicationState.chromeBuildRotationCounter, managedWorkers.length);
  const launchableWorkers = managedWorkers.filter(worker => {
    worker.browserVersion = availableAdsPowerKernelVersions.shift();
    if (worker.browserVersion) {
      return true;
    }
    warnings.push(`Slot ${worker.slot}: Không còn phiên bản SunBrowser riêng. Hãy cài thêm kernel AdsPower hoặc giảm số slot đồng thời.`);
    releaseProxyLock(worker.assignedProxy, worker.actualExitIp);
    if (worker.actualExitIp === 'Direct') activeExitIpLocks.delete('Direct');
    return false;
  });

  // Khởi chạy song song các profile với giãn cách nhẹ giữa các lần gọi daemon.
  await Promise.all(launchableWorkers.map(async (worker, workerIdx) => {
    if (workerIdx > 0) {
      const staggerMs = Math.max(800, delayStart > 0 ? delayStart * 1000 : 800);
      await new Promise(r => setTimeout(r, workerIdx * staggerMs));
    }
    if (autoRefill.stopRequested || !autoRefill.enabled) {
      releaseProxyLock(worker.assignedProxy, worker.actualExitIp);
      if (worker.actualExitIp === 'Direct') activeExitIpLocks.delete('Direct');
      return;
    }
    try {
      const profileOptions = {
        slot: worker.slot,
        proxy: worker.assignedProxy,
        exitIp: worker.actualExitIp,
        websiteUrl: worker.slotOfferUrl,
        antiFingerprint,
        deviceProfile: worker.deviceProfile,
        browserVersion: worker.browserVersion,
        resolution: `${DEVICE_PROFILES[worker.deviceProfile]?.screen?.width ?? 1920}x${DEVICE_PROFILES[worker.deviceProfile]?.screen?.height ?? 1080}`
      };
      const profileId = await getOrCreateAdsPowerProfile(apiToken, buildAdsPowerProfileRequest(profileOptions), activeProfileIds, worker.slot);
      activeProfileIds.add(profileId);
      worker.profileId = profileId;
      const launchedSession = await openAdsPowerBrowser({
        tileIndex: worker.tileIndex,
        slot: worker.slot,
        profileId,
        proxy: worker.assignedProxy,
        verifiedExitIp: worker.actualExitIp,
        websiteUrl: worker.slotOfferUrl,
        offer: worker.offerNum,
        offerUrls: worker.offerUrls || offerUrls,
        threadCount: worker.threadCount || count,
        multiTab: worker.multiTab ?? multiTab,
        autofillRecords,
        autoSubmit: body.autoSubmitForm !== false,
        leadConfig,
        scriptSteps,
        captchaApiKey,
        completeText,
        timeLimit,
        delayStop,
        scriptPath,
        hideUntilTarget,
        hideUntilLead,
        deviceProfile: worker.deviceProfile,
        browserVersion: worker.browserVersion,
        antiFingerprint,
        deleteProfile: () => deleteAdsPowerProfile(apiToken, profileId),
        startProfile: opts => startAdsPowerProfile(apiToken, profileId, opts),
        stopProfile: () => stopAdsPowerProfile(apiToken, profileId),
        totalCount: concurrency,
        screenPreviewOnly,
        useCloakBrowser,
        dataSaver: body.dataSaver !== false
      });
      results.push({
        status: 'ok',
        slot: worker.slot,
        offer: worker.offerNum,
        mode: 'adspower-sunbrowser',
        profileId: launchedSession.profileId || worker.profileId
      });
      applicationState.chromeBuildRotationCounter += 1;
      if (worker.assignedProxy?._queueLine) {
        const queueIndex = proxyQueue.available.indexOf(worker.assignedProxy._queueLine);
        if (queueIndex !== -1) {
          proxyQueue.available.splice(queueIndex, 1);
          proxyQueue.used.push(worker.assignedProxy._queueLine);
          void saveProxyQueue();
        }
      }
      if (worker.assignedProxy && worker.actualExitIp) {
        const pKey = createProxyUsageKey(worker.assignedProxy, 1, worker.slotOfferUrl);
        usageHistory.proxies[pKey] = {
          status: 'success',
          proxy: worker.assignedProxy.server,
          exitIp: worker.actualExitIp,
          websiteUrl: worker.slotOfferUrl,
          offerNumber: worker.offerNum,
          profileId: launchedSession.profileId,
          attemptedAt: new Date().toISOString(),
          completedAt: new Date().toISOString()
        };
        void persistProxyUsageHistory(usageHistory).catch(() => {});
      }
    } catch (err) {
      if (worker.profileId) {
        await stopAdsPowerProfile(apiToken, worker.profileId).catch(() => {});
        await deleteAdsPowerProfile(apiToken, worker.profileId).catch(cleanupError => {
          console.warn(`[Browser] Không xóa được profile ${worker.profileId}: ${cleanupError.message}`);
        });
      }
      if (worker.assignedProxy) {
        releaseProxyLock(worker.assignedProxy, worker.actualExitIp);
        const pKey = createProxyUsageKey(worker.assignedProxy, 1, worker.slotOfferUrl);
        usageHistory.proxies[pKey] = {
          status: 'failed',
          proxy: worker.assignedProxy.server,
          exitIp: worker.actualExitIp,
          websiteUrl: worker.slotOfferUrl,
          offerNumber: worker.offerNum,
          profileId: worker.profileId,
          reason: err.message,
          attemptedAt: new Date().toISOString(),
          completedAt: new Date().toISOString()
        };
        void persistProxyUsageHistory(usageHistory).catch(() => {});
      } else if (worker.actualExitIp === 'Direct') {
        activeExitIpLocks.delete('Direct');
      }
      warnings.push(`Slot ${worker.slot}: ${err.message}`);
    }
  }));
  return {
    results,
    warnings
  };
}
