import { DEFAULT_LEAD_CONFIG } from '../../../lead-check.mjs';
import { isExitIpConsumed } from '../../proxy/actions/is-exit-ip-consumed.mjs';
import { DEVICE_PROFILES } from '../../runtime/constants/device-profiles.mjs';
import { acquireProxyLock } from '../../proxy/actions/acquire-proxy-lock.mjs';
import { countLiveBrowsers } from '../count-live-browsers.mjs';
import { activeBrowsers } from '../sessions.mjs';
import { activeExitIpLocks } from '../../runtime/constants/active-exit-ip-locks.mjs';
import { applicationState } from '../../runtime/application-state.mjs';
import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { buildMultiloginProfileRequest } from '../../../multilogin-profile.mjs';
import { checkProxyExitIp } from '../../proxy/actions/check-proxy-exit-ip.mjs';
import { createProxyUsageKey } from '../../proxy/actions/create-proxy-usage-key.mjs';
import { deleteMultiloginProfile } from '../../../multilogin-profile.mjs';
import { getOrCreateMultiloginProfile } from '../../../multilogin-profile.mjs';
import { importAutofillRecords } from '../../records/actions/import-autofill-records.mjs';
import { isExitIpCurrentlyInUse } from '../../proxy/actions/is-exit-ip-currently-in-use.mjs';
import { isProxyCurrentlyActive } from '../../proxy/actions/is-proxy-currently-active.mjs';
import { loadScript } from '../../../script.mjs';
import { maxAliveBrowsers } from '../../runtime/constants/max-alive-browsers.mjs';
import { offerStrategyState } from '../../runtime/constants/offer-strategy-state.mjs';
import { openMultiloginBrowser } from './open-multilogin-browser.mjs';
import { parseAutofillRecords } from '../../../autofill.mjs';
import { parseProxyLine } from '../../proxy/configuration.mjs';
import { persistProxyUsageHistory } from '../../proxy/actions/persist-proxy-usage-history.mjs';
import { proxyIdentity } from '../../runtime/actions/proxy-identity.mjs';
import { proxyQueue } from '../../runtime/constants/proxy-queue.mjs';
import { pruneDeadManagedSessions } from '../../runtime/actions/prune-dead-managed-sessions.mjs';
import { readMultiloginConfig } from '../../runtime/actions/read-multilogin-config.mjs';
import { readProxyUsageHistory } from '../../proxy/actions/read-proxy-usage-history.mjs';
import { releaseProxyLock } from '../../proxy/actions/release-proxy-lock.mjs';
import { safeNormalizeUrl } from '../../proxy/configuration.mjs';
import { saveAutoRefillSettings } from '../../refill/actions/save-auto-refill-settings.mjs';
import { saveAutofillQueue } from '../../records/actions/save-autofill-queue.mjs';
import { saveProxyQueue } from '../../proxy/actions/save-proxy-queue.mjs';
import { startMultiloginProfile } from '../../../multilogin-profile.mjs';
import { stopMultiloginProfile } from '../../../multilogin-profile.mjs';

/**
 * Tạo profile Multilogin (Mimic) riêng cho từng luồng rồi khởi chạy và kết nối Playwright.
 *
 * @param {string} requestBody JSON từ giao diện.
 * @param {boolean} [isAutomaticRefill=false] Giữ mục tiêu và cấu hình gốc khi chỉ bù slot trống.
 * @param {number[]|null} [assignedStreamRoles=null] Offer đã được bộ bù slot phân chia.
 * @return {Promise<{results: object[], warnings: string[]}>} Kết quả mở các slot.
 * @throws {Error} Khi thiếu API token hoặc không thể chuẩn bị profile.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export async function launchMultiloginBrowsers(requestBody, isAutomaticRefill = false, assignedStreamRoles = null) {
  const body = JSON.parse(requestBody);
  const mlConfig = await readMultiloginConfig();
  const apiToken = body.multiloginToken || mlConfig.token;
  const folderId = body.multiloginFolderId || mlConfig.folderId;
  const launcherUrl = body.multiloginLauncherUrl || mlConfig.launcherUrl || 'https://launcher.mlx.yt:45001';

  if (!apiToken) {
    throw new Error('Chưa cấu hình Multilogin Token. Hãy nhập token trong cài đặt Multilogin trước khi chạy.');
  }

  if (!isAutomaticRefill) {
    autoRefill.stopRequested = false;
    autoRefill.enabled = true;
  }
  const concurrency = Math.min(maxAliveBrowsers, parseInt(body.requestedCount ?? body.concurrency) || 1);
  const requestedCount = concurrency;
  const websiteUrl = body.websiteUrl ? String(body.websiteUrl).trim() : '';
  const offerUrls = (body.offerUrls || [websiteUrl, body.websiteUrl2, body.websiteUrl3, body.websiteUrl4]).filter(Boolean);
  const multiTab = body.multiTab !== false;
  const screenPreviewOnly = Boolean(body.screenPreviewOnly ?? body.runInApp ?? true);
  const choiceDelay = body.enableChoiceDelay !== false && Number(body.choiceDelay) > 0 ? Number(body.choiceDelay) : 0;

  // Đọc danh sách profile đang chạy để tránh chiếm dụng
  const activeProfileIds = new Set(
    Array.from(activeBrowsers)
      .map(s => s.profileId)
      .filter(Boolean)
  );

  const usageHistory = await readProxyUsageHistory();
  const results = [];
  const warnings = [];

  const occupiedSlots = new Set(Array.from(activeBrowsers).map(b => b.slot).filter(Boolean));
  let nextSlot = 1;
  const getNextFreeSlot = () => {
    while (occupiedSlots.has(nextSlot)) nextSlot++;
    occupiedSlots.add(nextSlot);
    return nextSlot;
  };

  for (let i = 0; i < requestedCount; i++) {
    if (i > 0) {
      await new Promise(r => setTimeout(r, Math.min(i * 800, 3000)));
    }
    if (activeBrowsers.size >= maxAliveBrowsers) {
      warnings.push(`Đã đạt giới hạn tối đa ${maxAliveBrowsers} phiên đồng thời.`);
      break;
    }

    const slot = getNextFreeSlot();
    const proxyCandidate = proxyQueue.available.shift();
    let proxy = null;
    let verifiedExitIp = '';

    if (proxyCandidate) {
      proxy = parseProxyLine(proxyCandidate, body.proxyType ?? 'socks5');
      try {
        const checkResult = await checkProxyExitIp(proxy);
        verifiedExitIp = checkResult.exitIp;
      } catch (checkErr) {
        warnings.push(`Slot ${slot}: Kiểm tra IP proxy thất bại: ${checkErr.message}`);
        continue;
      }
    }

    const profileRequest = buildMultiloginProfileRequest({
      slot,
      proxy,
      exitIp: verifiedExitIp,
      websiteUrl,
      folderId,
      deviceProfile: body.deviceProfile || 'windows',
      antiFingerprint: {
        canvas: body.antiFpCanvas !== false,
        clientRects: body.antiFpClientRects !== false,
        webgl: body.antiFpWebgl !== false,
        webrtc: body.antiFpWebrtc !== false
      }
    });

    let profileId = '';
    try {
      profileId = await getOrCreateMultiloginProfile({
        token: apiToken,
        folderId,
        slot,
        profileRequest,
        activeProfileIds
      });
      activeProfileIds.add(profileId);
    } catch (createErr) {
      warnings.push(`Slot ${slot}: Không tạo hoặc tái sử dụng được profile Multilogin: ${createErr.message}`);
      if (proxyCandidate) proxyQueue.available.unshift(proxyCandidate);
      continue;
    }

    try {
      const session = await openMultiloginBrowser({
        tileIndex: slot - 1,
        slot,
        profileId,
        folderId,
        proxy,
        verifiedExitIp,
        websiteUrl,
        offerUrls,
        multiTab,
        maxRunMinutes: Math.max(0, Number(body.maxRunMinutes) || 0),
        screenPreviewOnly,
        choiceDelay,
        leadConfig: {
          enabled: body.enableLeadCheck === true,
          stopAutofillOnLead: body.stopAutofillOnLead === true,
          apiUrl: body.leadCheckApiUrl,
          cookie: body.leadCheckCookie,
          interval: body.leadCheckInterval
        },
        startProfile: opts => startMultiloginProfile({
          token: apiToken,
          folderId,
          profileId,
          launcherUrl,
          headless: opts.headless
        }),
        stopProfile: pid => stopMultiloginProfile({
          token: apiToken,
          folderId,
          profileId: pid,
          launcherUrl
        })
      });

      results.push({
        slot,
        profileId,
        exitIp: session.exitIp,
        status: 'opened'
      });
    } catch (openErr) {
      warnings.push(`Slot ${slot}: Khởi chạy Multilogin thất bại: ${openErr.message}`);
      await stopMultiloginProfile({ token: apiToken, folderId, profileId, launcherUrl }).catch(() => {});
      activeProfileIds.delete(profileId);
      if (proxyCandidate) proxyQueue.available.unshift(proxyCandidate);
    }
  }

  // Cập nhật cài đặt tự bù
  if (!isAutomaticRefill) {
    autoRefill.settings = {
      ...body,
      browserMode: 'Multilogin',
      useMultilogin: true
    };
    autoRefill.targetCount = requestedCount;
    await saveAutoRefillSettings().catch(() => {});
  }

  await saveProxyQueue().catch(() => {});

  return {
    results,
    warnings,
    activeCount: countLiveBrowsers(),
    targetCount: autoRefill.targetCount
  };
}
