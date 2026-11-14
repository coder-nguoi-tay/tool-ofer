import { attachUniqueOfferTabs } from '../tabs/attach-unique-offer-tabs.mjs';
import { selectUniqueOfferUrls } from '../tabs/select-unique-offer-urls.mjs';
import { resumeAutofillAfterAi } from './resume-autofill-after-ai.mjs';
import { attachBrowserCloseHandler } from './attach-browser-close-handler.mjs';
import { protectConfirmedLeadSession } from '../../leads/actions/protect-confirmed-lead-session.mjs';
import { DEVICE_PROFILES } from '../../runtime/constants/device-profiles.mjs';
import { activeBrowsers } from '../sessions.mjs';
import { activeExitIpLocks } from '../../runtime/constants/active-exit-ip-locks.mjs';
import { appDataDirectory } from '../../config/paths.mjs';
import { applicationState } from '../../runtime/application-state.mjs';
import { applyNativeOverrides } from '../../../stealth.mjs';
import { attachAutofill } from '../../../autofill.mjs';
import { attachBandwidthTracker } from '../../monitoring/bandwidth.mjs';
import { attachBrowserLogger } from './attach-browser-logger.mjs';
import { attachDataSaver } from '../data-saver.mjs';
import { attachFullHtmlLoggerToBrowser } from '../../logging/html-capture.mjs';
import { attachFullHtmlLoggerToContext } from '../../logging/html-capture.mjs';
import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { autofillQueue } from '../../runtime/constants/autofill-queue.mjs';
import { autofillRecordIdentity } from '../../records/actions/autofill-record-identity.mjs';
import { browserIpCheckUrls } from '../../runtime/constants/browser-ip-check-urls.mjs';
import { buildBrandLists } from '../../../stealth.mjs';
import { buildStealthConfig } from '../../../stealth.mjs';
import { buildUserAgentOverride } from '../../../stealth.mjs';
import { chromium } from 'playwright';
import { closeChromeWhenLastTabCloses } from './close-chrome-when-last-tab-closes.mjs';
import { dirname } from 'node:path';
import { handleFormRejected } from '../../records/actions/handle-form-rejected.mjs';
import { hideWindowOffscreen } from './hide-window-offscreen.mjs';
import { isToffersDuplicateOfferUrl } from '../../leads/actions/is-toffers-duplicate-offer-url.mjs';
import { limitOfferTabs } from '../tabs/limit-offer-tabs.mjs';
import { markAutofillRecordUsed } from '../../records/actions/mark-autofill-record-used.mjs';
import { navigationTimeout } from '../../runtime/constants/navigation-timeout.mjs';
import { offerStrategyState } from '../../runtime/constants/offer-strategy-state.mjs';
import { queueAutomaticRefill } from '../../refill/actions/queue-automatic-refill.mjs';
import { readScreenSize } from './read-screen-size.mjs';
import { releaseProxyLock } from '../../proxy/actions/release-proxy-lock.mjs';
import { releaseScreencast } from '../screencast.mjs';
import { requestManagedProfileStop } from './request-managed-profile-stop.mjs';
import { runAiAssist } from '../../../ai-assist.mjs';
import { runScript } from '../../../script.mjs';
import { safeCloneRecord } from '../../records/actions/safe-clone-record.mjs';
import { saveAndRecordLeadIpStats } from '../../leads/statistics/save-and-record-lead-ip-stats.mjs';
import { saveAutofillQueue } from '../../records/actions/save-autofill-queue.mjs';
import { screencastSessions } from '../../runtime/constants/screencast-sessions.mjs';
import { startLeadVerification } from '../../leads/actions/start-lead-verification.mjs';
import { startManualOpsRecorder } from '../../../observer.mjs';
import { stealthInitScript } from '../../../stealth.mjs';
import { suppressBringToFrontWhileHidden } from '../window/suppress-bring-to-front-while-hidden.mjs';
import { takeNextEmail } from '../../queues/email.mjs';
import { takeNextRecord } from '../../records/actions/take-next-record.mjs';
import { tgNotify } from '../../../tgbot.mjs';
import { tileAt } from './tile-at.mjs';
import { watchTrafficBlockedPage } from '../../leads/actions/watch-traffic-blocked-page.mjs';
import { withoutSessionEmail } from '../../records/actions/without-session-email.mjs';
import { attachMaxRunTimer } from './attach-max-run-timer.mjs';

/**
 * Mở profile Multilogin (Mimic), xác minh IP rồi kết nối điều khiển Playwright.
 *
 * @param {object} options Cấu hình slot, proxy, lead, autofill, script và vòng đời profile.
 * @return {Promise<object>} Đối tượng phiên đã đăng ký vào activeBrowsers.
 * @throws {Error} Khi không mở được profile hoặc kết nối CDP thất bại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export async function openMultiloginBrowser({
  tileIndex,
  slot,
  profileId,
  folderId = '',
  proxy,
  verifiedExitIp,
  websiteUrl,
  offer = 1,
  autofillRecords = [],
  autoSubmit = true,
  leadConfig = {},
  scriptSteps = null,
  captchaApiKey = '',
  completeText = '',
  timeLimit = 0,
  maxRunMinutes = 0,
  delayStop = 0,
  scriptPath = '',
  hideUntilTarget = false,
  hideUntilLead = false,
  totalCount = 10,
  screenPreviewOnly = false,
  deviceProfile = 'windows',
  browserVersion = '130',
  antiFingerprint = {},
  deleteProfile = null,
  startProfile,
  stopProfile,
  offerUrls = [],
  threadCount = 1,
  multiTab = true,
  choiceDelay = 0,
  dataSaver = true
}) {
  const assignedSlot = slot ?? tileIndex + 1;
  const screen = await readScreenSize();
  const tile = tileAt(tileIndex ?? assignedSlot - 1, totalCount || 10, screen);
  const proxyUrl = proxy?.server ?? null;
  const initialExitIp = verifiedExitIp || 'Direct';

  const hideInitialWindow = screenPreviewOnly || hideUntilTarget || hideUntilLead;
  const trueHeadless = Boolean(screenPreviewOnly);

  // Multilogin Launcher cấp port debug hoặc CDP WebSocket URL
  const cdpEndpoint = await startProfile({
    profileId,
    folderId,
    headless: trueHeadless
  });
  if (!cdpEndpoint) throw new Error('Multilogin không trả về địa chỉ kết nối CDP.');

  // Kết nối Playwright vào Multilogin qua CDP (timeout 15s)
  const cdpBrowser = await Promise.race([
    chromium.connectOverCDP(cdpEndpoint),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Multilogin CDP connect timeout 15s')), 15000))
  ]);
  console.log(`[Multilogin] CDP connected. Contexts: ${cdpBrowser.contexts().length}`);

  const context = cdpBrowser.contexts()[0] || await cdpBrowser.newContext();
  if (!context) {
    await cdpBrowser.close().catch(() => {});
    await stopProfile(profileId).catch(() => {});
    throw new Error('Multilogin không có context mặc định để kết nối.');
  }


  // Thu nhỏ hoặc ẩn nếu cần
  let cdpSession = null;
  let cdpWindowId = null;
  try {
    const activePage = context.pages().filter(p => !p.isClosed())[0];
    if (activePage) {
      cdpSession = await context.newCDPSession(activePage);
      const win = await cdpSession.send('Browser.getWindowForTarget');
      cdpWindowId = win.windowId;
      if (hideInitialWindow) {
        await hideWindowOffscreen(cdpSession, cdpWindowId);
      }
    }
  } catch {}

  const profileKey = DEVICE_PROFILES[deviceProfile] ? deviceProfile : 'windows';

  // Xác minh IP trong trình duyệt
  let detectedIp = null;
  let ipCheckPage = null;
  try {
    ipCheckPage = await context.newPage();
    for (const checkUrl of browserIpCheckUrls) {
      try {
        const response = await ipCheckPage.goto(checkUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 8000
        });
        if (!response?.ok()) continue;
        const content = await ipCheckPage.locator('body').innerText();
        const match = content.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
        if (match) {
          detectedIp = match[0];
          break;
        }
      } catch {}
    }
    if (!detectedIp) throw new Error('Không xác minh được IP trong Multilogin.');
    if (proxy && verifiedExitIp && detectedIp !== verifiedExitIp) {
      throw new Error(`Proxy trong trình duyệt ra IP ${detectedIp}, khác IP đã kiểm tra ${verifiedExitIp}.`);
    }
  } catch (error) {
    await cdpBrowser.close().catch(() => {});
    await stopProfile(profileId).catch(() => {});
    if (deleteProfile) await deleteProfile().catch(() => {});
    throw error;
  } finally {
    await ipCheckPage?.close().catch(() => {});
  }

  const osDisplay = {
    windows: 'Windows 10',
    macos: 'macOS 14',
    linux: 'Linux',
    android: 'Android 13',
    ios: 'iPhone',
    ipad: 'iPad'
  }[deviceProfile] || 'Windows 10';

  const osShort = {
    windows: 'Win 10',
    macos: 'macOS',
    linux: 'Linux',
    android: 'Android',
    ios: 'iPhone',
    ipad: 'iPad'
  }[deviceProfile] || 'Win 10';

  const chromeVer = `Mimic ${browserVersion || '130'}`;

  const session = {
    browser: context,
    _cdpBrowser: cdpBrowser,
    tileIndex: tileIndex ?? assignedSlot - 1,
    slot: assignedSlot,
    enableLeadCheck: leadConfig.enabled === true,
    stopAutofillOnLead: leadConfig.enabled === true && leadConfig.stopAutofillOnLead === true,
    chromeVersion: chromeVer,
    deviceProfile: osDisplay,
    deviceVersion: osDisplay,
    deviceSummary: `${osDisplay} · ${chromeVer} · Multilogin Mimic`,
    suppressAutoRefill: false,
    proxy: proxy ?? null,
    proxyKey: proxyUrl ?? profileId,
    proxyServer: proxyUrl ?? profileId,
    exitIp: detectedIp || initialExitIp,
    offer,
    offerNumber: offer,
    streamRole: offer,
    streamLabel: `Offer ${offer}`,
    websiteUrl: websiteUrl || '',
    profileId,
    folderId,
    browserWebSocketUrl: cdpEndpoint,
    _deleteProfile: deleteProfile,
    isManagedProfile: true,
    isMultilogin: true,
    _stopProfile: () => stopProfile(profileId),
    inAppPreview: Boolean(screenPreviewOnly),
    hideUntilTarget: Boolean(hideUntilTarget),
    hideUntilLead: Boolean(hideUntilLead),
    hasShownWindow: false,
    isWindowVisible: false,
    confirmedLeadIp: null,
    leadCheckStatus: null,
    leadCheckMessage: null,
    choiceDelay: Number(choiceDelay) || 0,
    bandwidthBytes: 0,
    bytesSent: 0,
    bytesReceived: 0,
    requestCount: 0,
    bandwidthFormatted: '0 B',
    dataSaver: Boolean(dataSaver),
    updateBadge: text => {
      session.badgeText = text;
    }
  };

  activeBrowsers.add(session);
  attachBandwidthTracker(context, session);
  if (session.dataSaver !== false) {
    void attachDataSaver(context, session);
  }
  try {
    if (session.browser) attachFullHtmlLoggerToContext(session.browser);
  } catch {}
  try {
    if (session._cdpBrowser) attachFullHtmlLoggerToBrowser(session._cdpBrowser);
  } catch {}

  const displayIp = detectedIp || initialExitIp;
  const titlePrefix = `[${displayIp}] [S${assignedSlot}|${osShort}|${chromeVer}]`;

  // InitScript ghim tiêu đề và thanh IP nổi
  await context.addInitScript(({ prefix, ip, slot, os, chrome }) => {
    try {
      const applyTitle = () => {
        try {
          let t = document.title || '';
          if (t.startsWith(`[${ip}]`)) return;
          t = t.replace(/^\[.*?\]\s*/g, '').replace(/^\[.*?\]\s*/g, '').trim();
          document.title = `${prefix} ${t || 'Web'}`;
        } catch {}
      };
      applyTitle();
      document.addEventListener('DOMContentLoaded', applyTitle);
      window.addEventListener('load', applyTitle);
      const obs = new MutationObserver(applyTitle);
      const target = document.querySelector('title') || document.head || document.documentElement;
      if (target) {
        obs.observe(target, { subtree: true, characterData: true, childList: true });
      }

      const injectTopBar = () => {
        try {
          if (document.getElementById('__autolead_ip_bar')) return;
          const bar = document.createElement('div');
          bar.id = '__autolead_ip_bar';
          bar.setAttribute('style', [
            'position: fixed', 'top: 0', 'left: 0', 'right: 0', 'height: 20px',
            'background: linear-gradient(90deg, #1e293b, #0f172a)',
            'color: #38bdf8', 'font-family: monospace', 'font-size: 11px', 'font-weight: bold',
            'line-height: 20px', 'padding: 0 10px', 'z-index: 2147483647',
            'display: flex', 'align-items: center', 'gap: 12px', 'box-shadow: 0 1px 4px rgba(0,0,0,0.4)',
            'pointer-events: none', 'user-select: none', 'letter-spacing: 0.3px'
          ].join('; '));
          bar.innerHTML = `<span style="color:#4ade80">●</span> <span>${ip}</span> <span style="color:#64748b">|</span> <span style="color:#f1f5f9">Slot ${slot}</span> <span style="color:#64748b">|</span> <span style="color:#94a3b8">${os} · ${chrome}</span>`;
          (document.body || document.documentElement).appendChild(bar);
        } catch {}
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectTopBar);
      } else {
        injectTopBar();
      }
    } catch {}
  }, {
    prefix: titlePrefix,
    ip: displayIp,
    slot: assignedSlot,
    os: osShort,
    chrome: chromeVer
  });

  // Mở trang đích hoặc các offer tabs
  limitOfferTabs(context, session);
  attachUniqueOfferTabs(context, session);
  const initialPage = context.pages().filter(p => !p.isClosed())[0] || await context.newPage();
  const effectiveOfferUrls = offerUrls.length > 0 ? offerUrls : (websiteUrl ? [websiteUrl] : []);
  const uniqueOfferUrls = selectUniqueOfferUrls(effectiveOfferUrls, multiTab);

  if (uniqueOfferUrls.length > 0 && uniqueOfferUrls[0]) {
    try {
      await initialPage.goto(uniqueOfferUrls[0], {
        waitUntil: 'domcontentloaded',
        timeout: navigationTimeout
      });
    } catch (err) {
      console.warn(`[Multilogin] Lỗi mở trang đầu: ${err.message}`);
    }
  }

  // Quản lý đóng tab và đóng trình duyệt
  attachBrowserCloseHandler(context, async () => {
    activeBrowsers.delete(session);
    try {
      await cdpBrowser.close().catch(() => {});
      await stopProfile(profileId).catch(() => {});
      if (deleteProfile) await deleteProfile().catch(() => {});
    } finally {
      if (proxyUrl) releaseProxyLock(proxyUrl);
    }
    if (!session.suppressAutoRefill && autoRefill.enabled && !autoRefill.stopRequested) {
      queueAutomaticRefill(2000);
    }
  });

  closeChromeWhenLastTabCloses(context, async () => {
    await requestManagedProfileStop(session);
  });

  // Gắn autofill
  if (autofillRecords.length > 0) {
    try {
      attachAutofill(context, {
        records: autofillRecords,
        autoSubmit,
        choiceDelay: session.choiceDelay,
        captchaApiKey,
        completeText
      });
    } catch (err) {
      console.warn(`[Multilogin] Lỗi gắn autofill: ${err.message}`);
    }
  }

  // Bắt đầu xác minh lead nếu bật
  if (leadConfig.enabled === true) {
    try {
      startLeadVerification(context, session, leadConfig);
    } catch (err) {
      console.warn(`[Multilogin] Lỗi kích hoạt kiểm tra lead: ${err.message}`);
    }
  }

  attachMaxRunTimer(session, maxRunMinutes);
  return session;
}
