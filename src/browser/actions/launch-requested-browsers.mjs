import { DEFAULT_LEAD_CONFIG } from '../../../lead-check.mjs';
import { isExitIpConsumed } from '../../proxy/actions/is-exit-ip-consumed.mjs';
import { IpVerificationError } from '../../proxy/actions/ip-verification-error.mjs';
import { activeBrowsers } from '../sessions.mjs';
import { applicationState } from '../../runtime/application-state.mjs';
import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { autofillQueue } from '../../runtime/constants/autofill-queue.mjs';
import { createProxyUsageKey } from '../../proxy/actions/create-proxy-usage-key.mjs';
import { executeFile } from '../../runtime/constants/execute-file.mjs';
import { getNextCollisionFreeProxy } from '../../proxy/actions/get-next-collision-free-proxy.mjs';
import { getNextDeviceProfile } from './get-next-device-profile.mjs';
import { getProxyUniqueKey } from '../../proxy/actions/get-proxy-unique-key.mjs';
import { importAutofillRecords } from '../../records/actions/import-autofill-records.mjs';
import { importEmailLines } from '../../queues/email.mjs';
import { importProxyLines } from '../../proxy/actions/import-proxy-lines.mjs';
import { initMultiOfferCursors } from '../../leads/actions/init-multi-offer-cursors.mjs';
import { isProxyUsedByAllOffers } from '../../proxy/actions/is-proxy-used-by-all-offers.mjs';
import { listInstalledChromeChannels } from '../chrome-installations.mjs';
import { loadScript } from '../../../script.mjs';
import { maxAliveBrowsers } from '../../runtime/constants/max-alive-browsers.mjs';
import { maxConcurrentProfiles } from '../../runtime/constants/max-concurrent-profiles.mjs';
import { multiOfferState } from '../../runtime/constants/multi-offer-state.mjs';
import { normalizeUrl } from '../../proxy/configuration.mjs';
import { offerStrategyState } from '../../runtime/constants/offer-strategy-state.mjs';
import { openBrowserWithInstalledChrome } from './open-browser-with-installed-chrome.mjs';
import { parseAutofillRecords } from '../../../autofill.mjs';
import { parseProxyLine } from '../../proxy/configuration.mjs';
import { persistProxyUsageHistory } from '../../proxy/actions/persist-proxy-usage-history.mjs';
import { proxyQueue } from '../../runtime/constants/proxy-queue.mjs';
import { readProxyUsageHistory } from '../../proxy/actions/read-proxy-usage-history.mjs';
import { readScreenSize } from './read-screen-size.mjs';
import { releaseProxyLock } from '../../proxy/actions/release-proxy-lock.mjs';
import { rotateProxyIfNeeded } from '../../proxy/configuration.mjs';
import { safeNormalizeUrl } from '../../proxy/configuration.mjs';
import { saveAutofillQueue } from '../../records/actions/save-autofill-queue.mjs';
import { saveDualStreamState } from '../../runtime/actions/save-dual-stream-state.mjs';
import { saveEmailQueue } from '../../queues/email.mjs';
import { saveProxyQueue } from '../../proxy/actions/save-proxy-queue.mjs';
import { syncDeviceProfilesFromSettings } from './sync-device-profiles-from-settings.mjs';
import { syncDualStreamState } from '../../runtime/actions/sync-dual-stream-state.mjs';
import { tileAt } from './tile-at.mjs';
import { watchTrafficBlockedPage } from '../../leads/actions/watch-traffic-blocked-page.mjs';

/**
 * Ghi nhận proxy trước khi thử, bỏ proxy đã dùng, tự thay proxy lỗi và lưu kết quả từng IP.
 * Dừng lượt và tạm tắt tự bù nếu dịch vụ xác minh IP không hoạt động.
 *
 * @param {string} requestBody Nội dung JSON nhận từ giao diện.
 * @param {{layoutTarget?: number, assignedStreamRoles?: number[]}} options Vị trí ô và offer được phân cho mỗi phiên.
 * @return {Promise<{results: string[], warnings: string[]}>} Kết quả proxy thành công/thất bại và cảnh báo.
 * @throws {Error} Khi cấu hình không hợp lệ hoặc sổ proxy không đọc/ghi được.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function launchRequestedBrowsers(requestBody, {
  layoutTarget = null,
  assignedStreamRoles = null
} = {}) {
  const body = JSON.parse(requestBody);
  syncDeviceProfilesFromSettings(body);
  if (applicationState.templateProfileContext) {
    throw new Error('Hãy đóng cửa sổ profile mẫu RoboForm trước khi tạo profile Chrome mới.');
  }
  const scriptPath = body.scriptPath ?? '';
  const captchaApiKey = body.captchaApiKey ?? '';
  const completeText = body.completeText ?? '';
  const timeLimit = Math.max(0, Number(body.timeLimit) || 0); // giây
  const delayStart = Math.max(0, Number(body.delayStart) || 0); // giây
  const delayStop = Math.max(0, Number(body.delayStop) || 0); // giây
  const newLimitRun = Math.max(0, Number(body.limitRun) || 0);
  if (newLimitRun > 0) applicationState.limitRunMax = newLimitRun;
  const antiFingerprint = {
    canvas: Boolean(body.antiFpCanvas),
    clientRects: Boolean(body.antiFpClientRects),
    webgl: Boolean(body.antiFpWebgl),
    webrtc: Boolean(body.antiFpWebrtc),
    fonts: Boolean(body.antiFpFonts),
    apiFakeIP: Boolean(body.antiFpApiFakeIP)
  };
  const hideUntilTarget = Boolean(body.hideUntilTarget ?? body.hideBrowser);
  const hideUntilLead = Boolean(body.hideUntilLead);
  const useCloakBrowser = Boolean(body.useCloakBrowser ?? body.cloakBrowser);
  // "Chạy trong app" (checkbox cbxRunInApp): true = chạy ngầm thu nhỏ (ScreenView),
  // false = mở cửa sổ Chrome bình thường ra Desktop. Mặc định true giữ hành vi cũ.
  const screenPreviewOnly = Boolean(body.screenPreviewOnly ?? body.runInApp ?? true);
  let scriptSteps = null;
  if (scriptPath) {
    try {
      scriptSteps = await loadScript(scriptPath);
    } catch (e) {
      console.warn(`[Script] Không đọc được script "${scriptPath}": ${e.message}`);
    }
  }
  const autofillRecords = parseAutofillRecords(body.autofillData);
  // Nạp autofill mới vào queue nếu queue trống
  if (autofillRecords.length > 0 && autofillQueue.available.length === 0 && autofillQueue.used.length === 0) {
    importAutofillRecords(autofillRecords);
    await saveAutofillQueue();
  } else if (autofillRecords.length > 0) {
    // Thêm record mới chưa có trong queue (user cập nhật danh sách)
    const added = importAutofillRecords(autofillRecords);
    if (added > 0) await saveAutofillQueue();
  }
  // Kiểm tra còn đủ record không
  if (autofillRecords.length > 0 && autofillQueue.available.length === 0) {
    return {
      results: [],
      warnings: ['Tất cả thông tin đã được dùng hết. Hãy bấm "Đặt lại" trong tab Proxy để dùng lại.']
    };
  }
  const proxyType = body.proxyType ?? 'socks5';
  // Nạp proxy mới từ textarea vào queue nếu queue đang trống
  if (proxyQueue.available.length === 0 && body.proxyList) {
    const added = importProxyLines((body.proxyList ?? '').split(/\r?\n/), proxyType);
    if (added > 0) await saveProxyQueue();
  }
  // Nạp email mẫu mới từ textarea vào queue nếu có
  if (body.emailList) {
    const added = importEmailLines((body.emailList ?? '').split(/\r?\n/));
    if (added > 0) await saveEmailQueue();
  }

  // 1. Phân tích danh sách các trang đích (hỗ trợ đa luồng nhiều offer)
  const offerUrls = [];
  if (Array.isArray(body.offerUrls) && body.offerUrls.length > 0) {
    offerUrls.push(...body.offerUrls.map(u => normalizeUrl(u)).filter(Boolean));
  } else if (Array.isArray(body.offerList) && body.offerList.length > 0) {
    offerUrls.push(...body.offerList.map(u => normalizeUrl(u)).filter(Boolean));
  } else {
    const rawUrl1 = body.websiteUrl ? String(body.websiteUrl).trim() : '';
    const rawUrl2 = body.websiteUrl2 ? String(body.websiteUrl2).trim() : '';
    if (rawUrl1) {
      if (/[\r\n,;]/.test(rawUrl1)) {
        const parts = rawUrl1.split(/[\r\n,;]+/).map(u => u.trim()).filter(Boolean);
        for (const p of parts) {
          try {
            const norm = normalizeUrl(p);
            if (!offerUrls.includes(norm)) offerUrls.push(norm);
          } catch {}
        }
      } else {
        try {
          offerUrls.push(normalizeUrl(rawUrl1));
        } catch {}
      }
    }
    if (rawUrl2) {
      try {
        const norm2 = normalizeUrl(rawUrl2);
        if (!offerUrls.includes(norm2)) offerUrls.push(norm2);
      } catch {}
    }
    if (body.websiteUrl3) {
      try {
        const norm3 = normalizeUrl(body.websiteUrl3);
        if (!offerUrls.includes(norm3)) offerUrls.push(norm3);
      } catch {}
    }
    if (body.websiteUrl4) {
      try {
        const norm4 = normalizeUrl(body.websiteUrl4);
        if (!offerUrls.includes(norm4)) offerUrls.push(norm4);
      } catch {}
    }
  }
  let websiteUrl = offerUrls[0] || (body.websiteUrl ? normalizeUrl(body.websiteUrl) : '');
  let websiteUrl2 = offerUrls[1] || (body.websiteUrl2 ? normalizeUrl(body.websiteUrl2) : '');
  const isDualStream = offerUrls.length >= 2;
  const usageHistory = await readProxyUsageHistory();
  // IP được ghi nhận theo từng trang đích (exitIp::websiteUrl) để 1 IP mở được 2 trang đích đồng thời
  const usedExitIps = new Set(Object.values(usageHistory.proxies).map(entry => {
    // Duplicate IP / offer không khả dụng vẫn là IP đã vào offer: không mở lại cho cùng trang đích.
    if (!isExitIpConsumed(entry)) return null;
    return entry.websiteUrl ? `${entry.exitIp}::${safeNormalizeUrl(entry.websiteUrl)}` : entry.exitIp;
  }).filter(Boolean));

  // Proxy đã dùng không được dùng lại — bấm "Đặt lại hàng đợi" để dùng lại thủ công.

  // Queue là nguồn chính — parse available thành proxy objects, dedup theo identity (server + username/session)
  const seenProxyKeys = new Set();
  const availableProxies = proxyQueue.available.map(line => {
    try {
      return {
        ...parseProxyLine(line.trim(), 1, proxyType),
        _queueLine: line
      };
    } catch {
      return null;
    }
  }).filter(proxy => {
    if (!proxy) return false;
    const key = getProxyUniqueKey(proxy);
    if (seenProxyKeys.has(key)) return false;
    seenProxyKeys.add(key);
    return true;
  });

  // Khởi tạo hoặc cập nhật trạng thái Multi-Offer / Dual Stream khi bắt đầu phiên mới
  const offerCount = Math.max(1, offerUrls.length);
  const offerUrlsKey = offerUrls.join('|');
  const previousUrlsKey = (multiOfferState.offerUrls || []).join('|');
  const urlsChanged = offerUrlsKey !== previousUrlsKey;
  multiOfferState.enabled = offerCount >= 2;
  multiOfferState.offerCount = offerCount;
  multiOfferState.offerUrls = [...offerUrls];
  if (urlsChanged) {
    multiOfferState.offerUsed.clear();
    multiOfferState.offerCursors.clear();
    multiOfferState.offerDirections.clear();
    initMultiOfferCursors(offerCount, availableProxies.length);
    syncDualStreamState(offerCount);
    void saveDualStreamState();
  } else {
    for (let k = 1; k <= offerCount; k++) {
      if (!multiOfferState.offerCursors.has(k) && availableProxies.length > 0) {
        initMultiOfferCursors(offerCount, availableProxies.length);
        break;
      }
    }
    syncDualStreamState(offerCount);
  }
  const countParam = body.requestedCount !== undefined && body.requestedCount !== '' ? body.requestedCount : body.concurrency;
  let requestedCount = countParam !== undefined && countParam !== '' ? Number(countParam) : isDualStream ? 2 : Math.min(maxAliveBrowsers, availableProxies.length || 1);
  if (!Number.isInteger(requestedCount) || requestedCount < 1) {
    throw new Error('Số trình duyệt cần mở phải là số nguyên lớn hơn 0.');
  }
  if (isDualStream && requestedCount < 2) {
    requestedCount = 2; // Chạy 2 luồng yêu cầu tối thiểu 2 cửa sổ
  }
  if (requestedCount > maxAliveBrowsers) {
    throw new Error('Chỉ được mở tối đa ' + maxAliveBrowsers + ' cửa sổ trình duyệt cùng lúc.');
  }
  const targetSuccessCount = Math.min(requestedCount, isDualStream ? Math.max(availableProxies.length, requestedCount) : availableProxies.length);
  if (targetSuccessCount === 0 || availableProxies.length === 0) {
    return {
      results: [],
      warnings: [availableProxies.length === 0 ? 'Hàng đợi proxy trống. Hãy nhập thêm proxy hoặc bấm "Đặt lại hàng đợi" để dùng lại.' : 'Không đủ proxy để mở; kiểm tra cấu hình.']
    };
  }
  const warnings = requestedCount > availableProxies.length ? ['Bạn yêu cầu ' + requestedCount + ' trình duyệt nhưng hàng đợi chỉ còn ' + availableProxies.length + ' proxy.'] : [];

  // Dọn các phiên đã đóng hoặc mất kết nối khỏi activeBrowsers trước khi tính toán slot
  for (const session of [...activeBrowsers]) {
    const isDead = session.isClosed ||
      (session.browser && typeof session.browser.isClosed === 'function' && session.browser.isClosed()) ||
      (session.browser && typeof session.browser.isConnected === 'function' && !session.browser.isConnected()) ||
      (session.isManagedProfile && session._cdpBrowser && !session._cdpBrowser.isConnected());
    if (isDead) {
      session.isClosed = true;
      activeBrowsers.delete(session);
    }
  }
  const liveBrowsers = [...activeBrowsers].filter(s => !s.isClosed && !(s.browser?.isClosed?.()));
  const alreadyAlive = liveBrowsers.length;
  if (alreadyAlive + targetSuccessCount > maxAliveBrowsers) {
    const room = Math.max(0, maxAliveBrowsers - alreadyAlive);
    throw new Error('Máy này chỉ nên mở tối đa ' + maxAliveBrowsers + ' trình duyệt cùng lúc để không bị treo' + (alreadyAlive ? ' (đang mở ' + alreadyAlive + ', còn chỗ cho ' + room + ')' : '') + '. Bạn yêu cầu ' + targetSuccessCount + '. Hãy giảm số cửa sổ (hoặc bấm Đóng tất cả trước), ' + 'hoặc đóng bớt cửa sổ đang mở.');
  }
  const screen = await readScreenSize();
  const layoutCount = layoutTarget ?? Math.min(maxAliveBrowsers, alreadyAlive + targetSuccessCount);
  const occupiedTileIndexes = new Set(liveBrowsers.map(session => session.tileIndex));
  const availableTileIndexes = Array.from({
    length: layoutCount
  }, (_, index) => index).filter(index => !occupiedTileIndexes.has(index));
  const allInstalledBuilds = await listInstalledChromeChannels();
  if (allInstalledBuilds.length === 0) {
    throw new Error('Chưa cài đặt phiên bản Google Chrome nào.');
  }
  const occupiedChromeMajors = new Set(liveBrowsers.map(session => Number(session.chromeVersion?.split('.')[0])).filter(Boolean));
  let availableChromeBuilds = allInstalledBuilds.filter(build => !occupiedChromeMajors.has(build.major));
  if (availableChromeBuilds.length > 1) {
    const offset = applicationState.chromeBuildRotationCounter % availableChromeBuilds.length;
    availableChromeBuilds.push(...availableChromeBuilds.splice(0, offset));
  }
  // Nếu số phiên bản chưa mở ít hơn số lượng cần mở (hoặc các phiên bản đang bận/đang đóng),
  // tự động bổ sung xoay vòng từ danh sách tất cả phiên bản đã cài thay vì báo lỗi chặn đứng tiến trình.
  if (availableChromeBuilds.length < targetSuccessCount) {
    let poolIndex = applicationState.chromeBuildRotationCounter;
    while (availableChromeBuilds.length < targetSuccessCount) {
      availableChromeBuilds.push(allInstalledBuilds[poolIndex % allInstalledBuilds.length]);
      poolIndex++;
    }
  }
  warnings.push('Các phiên bản Google Chrome thường của lượt này: ' + availableChromeBuilds.slice(0, targetSuccessCount).map(build => build.version).join(', ') + '.');
  if (!autoRefill.settings) {
    autoRefill.settings = {
      proxyList: body.proxyList,
      proxyType: proxyType,
      websiteUrl: body.websiteUrl,
      websiteUrl2: websiteUrl2 || body.websiteUrl2,
      websiteUrl3: body.websiteUrl3,
      websiteUrl4: body.websiteUrl4,
      offerUrls,
      checkDuplicate: body.checkDuplicate !== false,
      autofillData: body.autofillData,
      emailList: body.emailList,
      autoSubmitForm: body.autoSubmitForm !== false,
      enableLeadCheck: body.enableLeadCheck === true,
      leadCheckApiUrl: body.leadCheckApiUrl,
      leadCheckCookie: body.leadCheckCookie,
      leadCheckDatas: body.leadCheckDatas,
      leadCheckInterval: body.leadCheckInterval,
      leadCheckMaxAttempts: body.leadCheckMaxAttempts,
      scriptPath,
      captchaApiKey,
      completeText,
      timeLimit,
      delayStart,
      delayStop,
      limitRun: newLimitRun,
      antiFpCanvas: antiFingerprint.canvas,
      antiFpClientRects: antiFingerprint.clientRects,
      antiFpWebgl: antiFingerprint.webgl,
      antiFpWebrtc: antiFingerprint.webrtc,
      Windows: Boolean(body.Windows),
      Mac: Boolean(body.Mac),
      Linux: Boolean(body.Linux),
      Android: Boolean(body.Android),
      iPhone: Boolean(body.iPhone),
      iPad: Boolean(body.iPad),
      useCloakBrowser,
      dataSaver: Boolean(body.dataSaver !== false)
    };
    if (autoRefill.targetCount < 1) autoRefill.targetCount = targetSuccessCount;
  }
  const results = [];
  let nextProxyIndex = 0;
  let successfulBrowsers = 0;

  /**
   * Thử proxy tiếp theo cho một slot đến khi mở thành công một cửa sổ Chrome.
   *
   * @param {number} workerIndex Chỉ số slot và bản Chrome được giao.
   * @return {Promise<void>} Kết thúc khi slot mở được hoặc hết proxy phù hợp.
   * @throws {Error} Khi không thể ghi lịch sử sử dụng proxy.
   * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
   * @since 2026-10-15
   */
  const attemptProxy = async workerIndex => {
    // Giãn cách khởi động giữa các worker (staggered launch) để tránh giật lag CPU và nghẽn mạng
    if (workerIndex > 0) {
      await new Promise(r => setTimeout(r, Math.min(workerIndex * 800, 4000)));
    }
    const offerCount = Math.max(1, offerUrls.length);
    const offerNumber = assignedStreamRoles?.[workerIndex] ?? workerIndex % offerCount + 1;
    const targetUrl = offerUrls[offerNumber - 1] || websiteUrl;
    if (offerStrategyState.get(offerNumber)?.mode === 'skip') return;
    const streamRole = offerNumber;
    const streamLabel = offerCount > 1 ? `Offer ${offerNumber}` : '';
    while (successfulBrowsers < targetSuccessCount) {
      if (autoRefill.stopRequested || !autoRefill.enabled) {
        console.log(`[attemptProxy] Stop đã được kích hoạt, dừng worker ${workerIndex + 1}.`);
        break;
      }
      // Dừng khi đã đạt giới hạn limitRun (số phiên hoàn tất)
      if (applicationState.limitRunMax > 0 && applicationState.limitRunCount >= applicationState.limitRunMax) {
        console.log(`[limitRun] Đã đạt giới hạn ${applicationState.limitRunMax} phiên hoàn tất, dừng mở thêm.`);
        break;
      }
      let proxy = getNextCollisionFreeProxy(offerNumber, availableProxies, offerCount);
      if (!proxy) break;
      if (proxy.resetUrl) {
        await rotateProxyIfNeeded(proxy);
      }
      if (autoRefill.stopRequested || !autoRefill.enabled) break;
      const proxyKey = createProxyUsageKey(proxy, 1, targetUrl);
      const installedChrome = availableChromeBuilds[workerIndex];
      const browserProfileId = 'chrome-' + installedChrome.channel + '-' + installedChrome.major;
      let exitIp;
      let failureReason;
      let activeSession;
      const attemptStartedAt = new Date().toISOString();
      const tileIndex = availableTileIndexes[workerIndex] ?? workerIndex;
      try {
        usageHistory.proxies[proxyKey] = {
          status: 'attempting',
          exitIp: null,
          proxy: proxy.server,
          username: proxy.username ?? '',
          websiteUrl: targetUrl,
          offerNumber: offerNumber,
          streamRole: streamRole,
          attemptedAt: attemptStartedAt
        };
        await persistProxyUsageHistory(usageHistory);
        const recordExitIp = async observedIp => {
          exitIp = observedIp;
          usageHistory.proxies[proxyKey] = {
            status: 'attempting',
            exitIp: exitIp,
            proxy: proxy.server,
            username: proxy.username ?? '',
            websiteUrl: targetUrl,
            offerNumber: offerNumber,
            streamRole: streamRole,
            attemptedAt: attemptStartedAt
          };
          await persistProxyUsageHistory(usageHistory);
        };
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
        const chosenDeviceProfile = getNextDeviceProfile();
        if (delayStart > 0) {
          await new Promise(r => setTimeout(r, delayStart * 1000));
        }
        if (autoRefill.stopRequested || !autoRefill.enabled) break;
        const openedBrowser = await openBrowserWithInstalledChrome({
          build: installedChrome,
          proxy: proxy,
          proxyKey: proxyKey,
          websiteUrl: targetUrl,
          offerNumber: offerNumber,
          usedExitIps: usedExitIps,
          onExitIp: recordExitIp,
          tile: tileAt(tileIndex, layoutCount, screen),
          tileIndex: tileIndex,
          autofillRecords: autofillRecords,
          autoSubmit: body.autoSubmitForm !== false,
          leadConfig,
          deviceProfile: chosenDeviceProfile,
          streamRole: streamRole,
          streamLabel: streamLabel,
          scriptSteps,
          captchaApiKey,
          completeText,
          timeLimit,
          delayStop,
          scriptPath,
          antiFingerprint,
          checkDuplicate: body.checkDuplicate !== false,
          hideUntilTarget,
          hideUntilLead,
          screenPreviewOnly,
          useCloakBrowser,
          dataSaver: body.dataSaver !== false
        });
        activeSession = openedBrowser.session;
        successfulBrowsers += 1;
        applicationState.chromeBuildRotationCounter += 1;

        // Quản lý hàng đợi proxyQueue:
        // 1 proxy dùng lại được cho tất cả offer; chỉ chuyển proxy vào proxyQueue.used
        // khi TẤT CẢ các offer đang cấu hình đều đã hoàn tất sử dụng proxy này thành công.
        if (isProxyUsedByAllOffers(proxy, offerCount)) {
          const queueIdx = proxyQueue.available.indexOf(proxy._queueLine);
          if (queueIdx !== -1) {
            proxyQueue.available.splice(queueIdx, 1);
            proxyQueue.used.push(proxy._queueLine);
            void saveProxyQueue();
          }
        }
        usageHistory.proxies[proxyKey] = {
          status: 'success',
          exitIp: exitIp,
          proxy: proxy.server,
          username: proxy.username ?? '',
          websiteUrl: targetUrl,
          offerNumber: offerNumber,
          streamRole: streamRole,
          finalUrl: openedBrowser.finalUrl,
          profileId: browserProfileId,
          attemptedAt: attemptStartedAt,
          completedAt: new Date().toISOString()
        };
        await persistProxyUsageHistory(usageHistory);
        watchTrafficBlockedPage(activeSession);
        results.push('Trình duyệt ' + successfulBrowsers + ' [Google Chrome ' + installedChrome.version + (streamLabel ? ` - ${streamLabel}` : '') + ']: mở đúng trang đích ' + targetUrl + ' qua IP ' + exitIp + ' (' + proxy.server + ').');
        return;
      } catch (error) {
        releaseProxyLock(proxy, exitIp);
        const pKey = getProxyUniqueKey(proxy);
        if (pKey) {
          multiOfferState.offerUsed.get(offerNumber)?.delete(pKey);
        }
        failureReason = error.message.split('\n')[0];
        if (activeSession) {
          activeSession.suppressAutoRefill = true;
          activeSession.isClosed = true;
          await activeSession.browser?.close?.().catch(() => {});
          if (activeSession.proxyKey) {
            await executeFile('pkill', ['-9', '-f', `user-data-dir.*${activeSession.proxyKey}`]).catch(() => {});
          }
        }
        await executeFile('pkill', ['-9', '-f', `user-data-dir.*${proxyKey}`]).catch(() => {});
        if (autoRefill.stopRequested || !autoRefill.enabled) {
          console.log(`[attemptProxy] Stop đã được kích hoạt sau lỗi proxy, dừng worker ${workerIndex + 1}.`);
          break;
        }
        const verificationFailure = error instanceof IpVerificationError;
        usageHistory.proxies[proxyKey] = {
          status: verificationFailure ? 'verification_error' : 'failed',
          exitIp: exitIp ?? null,
          proxy: proxy.server,
          username: proxy.username ?? '',
          websiteUrl: targetUrl,
          streamRole: streamRole,
          reason: failureReason,
          attemptedAt: attemptStartedAt,
          completedAt: new Date().toISOString()
        };
        await persistProxyUsageHistory(usageHistory);
        if (verificationFailure) {
          results.push('Proxy ' + proxy.server + ': lỗi kết nối khi xác minh IP (' + failureReason + '); đóng trình duyệt và thử proxy khác.');
          continue;
        }
        results.push('Proxy ' + proxy.server + ': loại bỏ IP ' + (exitIp ?? 'chưa xác định') + ' — ' + failureReason + '; đóng trình duyệt và thử proxy khác.');
      }
    }
  };
  await Promise.all(Array.from({
    length: Math.min(maxConcurrentProfiles, targetSuccessCount)
  }, (_, workerIndex) => attemptProxy(workerIndex)));
  if (successfulBrowsers < targetSuccessCount) {
    warnings.push('Chỉ mở được ' + successfulBrowsers + '/' + targetSuccessCount + ' trình duyệt; các proxy còn lại đã hết hoặc không tải đúng trang đích.');
  }
  return {
    results: results,
    warnings: warnings
  };
}
