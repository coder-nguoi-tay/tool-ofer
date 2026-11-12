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
import { applyCloakHumanize } from '../../../cloakbrowser-engine.mjs';
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
import { handleFormRejected } from "../../records/actions/handle-form-rejected.mjs";
import { hideWindowOffscreen } from './hide-window-offscreen.mjs';
import { isToffersDuplicateOfferUrl } from '../../leads/actions/is-toffers-duplicate-offer-url.mjs';
import { limitOfferTabs } from "../tabs/limit-offer-tabs.mjs";
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
import { saveAndRecordLeadIpStats } from "../../leads/statistics/save-and-record-lead-ip-stats.mjs";
import { saveAutofillQueue } from '../../records/actions/save-autofill-queue.mjs';
import { screencastSessions } from '../../runtime/constants/screencast-sessions.mjs';
import { startLeadVerification } from '../../leads/actions/start-lead-verification.mjs';
import { startManualOpsRecorder } from '../../../observer.mjs';
import { stealthInitScript } from '../../../stealth.mjs';
import { suppressBringToFrontWhileHidden } from "../window/suppress-bring-to-front-while-hidden.mjs";
import { takeNextEmail } from '../../queues/email.mjs';
import { takeNextRecord } from '../../records/actions/take-next-record.mjs';
import { tgNotify } from '../../../tgbot.mjs';
import { tileAt } from './tile-at.mjs';
import { watchTrafficBlockedPage } from '../../leads/actions/watch-traffic-blocked-page.mjs';
import { withoutSessionEmail } from '../../records/actions/without-session-email.mjs';

/**
 * Mở profile AdsPower, xác minh IP rồi gắn luồng Playwright hiện có.
 *
 * @param {object} options ID profile, proxy, slot và dữ liệu tự động hóa của phiên.
 * @return {Promise<object>} Session trình duyệt đã kết nối.
 * @throws {Error} Khi trình duyệt, CDP hoặc IP proxy không khớp.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function openAdsPowerBrowser({
  tileIndex,
  slot,
  profileId,
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
  delayStop = 0,
  scriptPath = '',
  hideUntilTarget = false,
  hideUntilLead = false,
  totalCount = 10,
  screenPreviewOnly = false,
  deviceProfile = 'windows',
  browserVersion = '155',
  antiFingerprint = {},
  deleteProfile = null,
  startProfile,
  stopProfile,
  offerUrls = [],
  threadCount = 1,
  multiTab = true,
  useCloakBrowser = false,
  dataSaver = true
}) {
  const assignedSlot = slot ?? tileIndex + 1;
  const screen = await readScreenSize();
  const tile = tileAt(tileIndex ?? assignedSlot - 1, totalCount || 10, screen);
  const proxyUrl = proxy?.server ?? null;
  const initialExitIp = verifiedExitIp || 'Direct';

  // "Chạy trong app" (checkbox cbxRunInApp): true/Ẩn-tới-target = cửa sổ chạy ngầm ngoài màn hình;
  // false = SunBrowser mở cửa sổ bình thường ra Desktop ngay khi khởi chạy.
  const hideInitialWindow = screenPreviewOnly || hideUntilTarget || hideUntilLead;
  // "Chạy trong app" → headless thật: không có cửa sổ, không có icon trên Dock (ưu tiên hơn ẩn-tới-target/lead).
  // Đổi lại nút "Hiện cửa sổ" và việc tự bung cửa sổ khi có lead không còn tác dụng; xem và thao tác qua Screen View.
  const trueHeadless = Boolean(screenPreviewOnly);

  // AdsPower cấp CDP URL cho profile SunBrowser vừa mở (chạy ẩn ban đầu ngoài màn hình, bấm mới hiện ra Desktop).
  const browserWebSocketUrl = await startProfile({
    headless: trueHeadless,
    launchArgs: hideInitialWindow ? ['--window-position=-20000,-20000', '--start-minimized', '--autoplay-policy=user-gesture-required'] : ['--window-position=40,60', `--window-size=${tile.width},${tile.height + 100}`, '--autoplay-policy=user-gesture-required']
  });
  if (!browserWebSocketUrl) throw new Error('AdsPower không trả CDP URL.');

  // Kết nối Playwright vào SunBrowser đang chạy qua CDP (timeout 15s).
  const cdpBrowser = await Promise.race([chromium.connectOverCDP(browserWebSocketUrl), new Promise((_, reject) => setTimeout(() => reject(new Error('CDP connect timeout 15s')), 15000))]);
  console.log(`[AdsPower] CDP connected. Contexts: ${cdpBrowser.contexts().length}`);
  const context = cdpBrowser.contexts()[0];
  if (!context) {
    await cdpBrowser.close().catch(() => {});
    await stopProfile(profileId).catch(() => {});
    throw new Error('SunBrowser không có profile mặc định để kết nối.');
  }
  let cloakHumanizeApplied = false;
  if (useCloakBrowser) {
    try {
      cloakHumanizeApplied = await applyCloakHumanize(context);
      console.log(cloakHumanizeApplied ? `[AdsPower] Đã gắn lớp Humanize của CloakBrowser cho profile ${profileId}` : `[AdsPower] Không gắn được lớp Humanize của CloakBrowser cho profile ${profileId}`);
    } catch (err) {
      console.warn(`[AdsPower] Lỗi gắn CloakBrowser Humanize: ${err.message}`);
    }
  }

  // Thu nhỏ và ẩn ngay lập tức qua CDP và AppleScript để đảm bảo không hiện trên màn hình lúc khởi chạy
  let cdpSession = null;
  let cdpWindowId = null;
  try {
    const activePage = context.pages().filter(p => !p.isClosed())[0];
    if (activePage) {
      cdpSession = await context.newCDPSession(activePage);
      const win = await cdpSession.send('Browser.getWindowForTarget');
      cdpWindowId = win.windowId;
      await hideWindowOffscreen(cdpSession, cdpWindowId);
    }
  } catch {}
  const profileKey = DEVICE_PROFILES[deviceProfile] ? deviceProfile : 'windows';

  // Kiểm tra IP ngay trong SunBrowser: proxy của profile phải thật sự áp dụng.
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
      } catch {
        // Dịch vụ IP đầu tiên lỗi thì thử dịch vụ còn lại.
      }
    }
    if (!detectedIp) throw new Error('Không xác minh được IP trong trình duyệt.');
    if (proxy && detectedIp !== verifiedExitIp) {
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
  const chromeVer = browserVersion ? `Chrome ${browserVersion}` : `Chrome ${cdpBrowser.version().replace(/^Chrome\//i, '')}`;
  const session = {
    browser: context,
    _cdpBrowser: cdpBrowser,
    tileIndex: tileIndex ?? assignedSlot - 1,
    slot: assignedSlot,
    enableLeadCheck: leadConfig.enabled === true,
    chromeVersion: chromeVer,
    deviceProfile: osDisplay,
    deviceVersion: osDisplay,
    deviceSummary: useCloakBrowser ? `${osDisplay} · ${chromeVer} · CloakBrowser Humanize` : `${osDisplay} · ${chromeVer} · Anti-Detect Active`,
    useCloakBrowser: Boolean(useCloakBrowser),
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
    browserWebSocketUrl,
    _deleteProfile: deleteProfile,
    isManagedProfile: true,
    isAdsPower: true,
    _stopProfile: () => stopProfile(profileId),
    inAppPreview: Boolean(screenPreviewOnly),
    hideUntilTarget: Boolean(hideUntilTarget),
    hideUntilLead: Boolean(hideUntilLead),
    hasShownWindow: false,
    isWindowVisible: false,
    confirmedLeadIp: null,
    leadCheckStatus: null,
    leadCheckMessage: null,
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

  // InitScript chạy ngay khi tài liệu vừa được tạo, áp dụng cho mọi page & frame
  await context.addInitScript(({
    prefix,
    ip,
    slot,
    os,
    chrome
  }) => {
    try {
      // 1. Luôn ghim [IP] lên đầu document.title để luôn nhìn thấy trên thanh tab
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
        obs.observe(target, {
          subtree: true,
          characterData: true,
          childList: true
        });
      }

      // 2. Thanh thông tin nổi ghim cố định ở mép trên cùng của trang web
      const injectTopBar = () => {
        try {
          if (document.getElementById('__autolead_ip_bar')) return;
          const bar = document.createElement('div');
          bar.id = '__autolead_ip_bar';
          bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:24px;background:rgba(15,23,42,0.94);color:#38bdf8;font-family:system-ui,-apple-system,sans-serif;font-size:11.5px;font-weight:700;display:flex;align-items:center;justify-content:space-between;padding:0 12px;z-index:2147483647;pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,0.5);border-bottom:1px solid #0284c7;letter-spacing:0.2px;';
          bar.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="background:#0284c7;color:#fff;padding:1px 6px;border-radius:3px;font-size:10px;">SLOT ${slot}</span>
              <span style="color:#22c55e;">🌐 IP: <b style="color:#fff;font-size:12px;">${ip}</b></span>
              <span style="color:#64748b;">|</span>
              <span style="color:#cbd5e1;">💻 ${os}</span>
              <span style="color:#64748b;">|</span>
              <span style="color:#38bdf8;">${chrome}</span>
            </div>
            <div style="color:#f59e0b;font-size:10.5px;">AutoLeadPC AdsPower</div>
          `;
          (document.body || document.documentElement).appendChild(bar);
        } catch {}
      };
      if (document.body) injectTopBar();else document.addEventListener('DOMContentLoaded', injectTopBar);
    } catch {}
  }, {
    prefix: titlePrefix,
    ip: displayIp,
    slot: assignedSlot,
    os: osDisplay,
    chrome: chromeVer
  }).catch(() => {});
  const watchAndEnforcePageTitle = p => {
    const enforce = async () => {
      try {
        if (!p || p.isClosed()) return;
        await p.evaluate(({
          prefix,
          ip
        }) => {
          let t = document.title || '';
          if (!t.startsWith(`[${ip}]`)) {
            t = t.replace(/^\[.*?\]\s*/g, '').replace(/^\[.*?\]\s*/g, '').trim();
            document.title = `${prefix} ${t || 'Web'}`;
          }
        }, {
          prefix: titlePrefix,
          ip: displayIp
        }).catch(() => {});
      } catch {}
    };
    p.on('load', enforce);
    p.on('domcontentloaded', enforce);
    void enforce();
  };
  context.on('page', watchAndEnforcePageTitle);
  for (const existingPage of context.pages()) {
    watchAndEnforcePageTitle(existingPage);
  }

  // Gắn thêm lớp stealthInitScript để đảm bảo loại bỏ hoàn toàn dấu vết automation và thêm lớp nhiễu phụ trợ
  try {
    // Giữ đúng thiết bị được tích (kể cả macOS/Linux): Version click đúng nhờ applyNativeOverrides bù
    // Sec-CH-UA-Platform-Version cho mọi bước điều hướng, không cần ép Desktop về Windows.
    const dp = DEVICE_PROFILES[deviceProfile] || DEVICE_PROFILES.windows;
    const effectiveUa = dp.ua(String(browserVersion || '130'));
    const stealthConfig = buildStealthConfig(dp, antiFingerprint, assignedSlot, effectiveUa);
    await context.addInitScript(stealthInitScript, stealthConfig);

    // Đồng bộ UA, Client Hints (Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version) tận gốc qua CDP cho AdsPower
    const effectiveBuild = {
      version: String(browserVersion || '130'),
      channel: 'stable'
    };
    const brandLists = buildBrandLists(effectiveBuild.version, 'Google Chrome');
    const secChUaHeader = brandLists.brands.map(b => `"${b.brand}";v="${b.version}"`).join(', ');
    const clientHintHeaders = dp.uaData ? {
      'Sec-CH-UA': secChUaHeader,
      'Sec-CH-UA-Platform': `"${dp.uaData.platform || 'Windows'}"`,
      'Sec-CH-UA-Platform-Version': `"${dp.uaData.platformVersion || (dp.uaData.platform === 'Windows' ? '10.0.0' : '')}"`,
      'Sec-CH-UA-Mobile': dp.isMobile ? '?1' : '?0',
      'Sec-CH-UA-Model': `"${dp.uaData.model || ''}"`,
      'Sec-CH-UA-Arch': `"${dp.uaData.architecture ?? ''}"`,
      'Sec-CH-UA-Bitness': `"${dp.uaData.bitness ?? ''}"`,
      'Sec-CH-UA-WoW64': '?0'
    } : {};
    const nativeOverrides = {
      userAgentOverride: buildUserAgentOverride(dp, effectiveBuild, ['en-US', 'en']),
      hardwareConcurrency: dp.spoof?.hardwareConcurrency || 8,
      deviceProfile: dp,
      timezoneId: null,
      clientHintHeaders
    };
    const applyOverridesSafely = async targetPage => {
      try {
        if (!targetPage.isClosed()) {
          await applyNativeOverrides(context, targetPage, nativeOverrides);
        }
      } catch {}
    };
    context.on('page', newPage => {
      void applyOverridesSafely(newPage);
    });
    for (const existing of context.pages()) {
      void applyOverridesSafely(existing);
    }
  } catch (err) {
    console.warn('[AdsPower] Lỗi gắn stealth script:', err.message);
  }

  // Thu nhỏ cửa sổ về chạy ngầm trong app (ScreenView) khi khởi chạy Nếu bật
  // "Chạy trong app" hoặc ẩn tới khi có target/lead. Khi "Chạy trong app" tắt →
  // cửa sổ SunBrowser mở bình thường ra Desktop.
  try {
    const initPage = context.pages()[0] ?? (await context.newPage());
    if (!cdpSession && initPage) {
      cdpSession = await context.newCDPSession(initPage);
    }
    if (cdpSession) {
      if (!cdpWindowId) {
        const win = await cdpSession.send('Browser.getWindowForTarget');
        cdpWindowId = win.windowId;
      }
      if (screenPreviewOnly || hideUntilTarget || hideUntilLead) {
        await hideWindowOffscreen(cdpSession, cdpWindowId);
        session.isWindowVisible = false;
        console.log(`[AdsPower] Slot ${assignedSlot}: Chạy ngầm trong app (thu nhỏ cửa sổ Desktop, bấm mới hiện).`);
        session.addBrowserLog?.({
          type: 'navigate',
          detail: 'Chạy ngầm trong app (thu nhỏ cửa sổ Desktop, bấm mới hiện)...'
        });
      } else {
        session.isWindowVisible = true;
        session.hasShownWindow = true;
        console.log(`[AdsPower] Slot ${assignedSlot}: Mở cửa sổ SunBrowser bình thường ("Chạy trong app" đang tắt).`);
        session.addBrowserLog?.({
          type: 'navigate',
          detail: 'Mở cửa sổ SunBrowser bình thường ("Chạy trong app" tắt)...'
        });
      }
    }
  } catch (err) {
    console.warn('[AdsPower] Lỗi thu nhỏ cửa sổ ban đầu:', err.message);
  }
  session.showWindow = async (force = false) => {
    if (session.trueHeadless) {
      session.addBrowserLog?.({
        type: 'navigate',
        detail: 'Đang chạy headless (Chạy trong app) nên không có cửa sổ để hiện; xem qua Screen View.'
      });
      return;
    }
    try {
      const activePage = session.mainPage || context.pages().filter(p => !p.isClosed())[0];
      if (!cdpSession && activePage) {
        cdpSession = await context.newCDPSession(activePage);
      }
      if (cdpSession) {
        if (!cdpWindowId) {
          const win = await cdpSession.send('Browser.getWindowForTarget');
          cdpWindowId = win.windowId;
        }
        await cdpSession.send('Browser.setWindowBounds', {
          windowId: cdpWindowId,
          bounds: {
            left: tile.left,
            top: tile.top,
            width: tile.width,
            height: tile.height,
            windowState: 'normal'
          }
        });
        // Đặt cờ hiện trước khi bringToFront, nếu không suppressBringToFrontWhileHidden chặn mất lệnh đưa lên trước.
        session.hasShownWindow = true;
        session.isWindowVisible = true;
        if (activePage) await activePage.bringToFront().catch(() => {});
        console.log(`[AdsPower] Slot ${assignedSlot}: Đã hiển thị cửa sổ trình duyệt ra Desktop.`);
        session.addBrowserLog?.({
          type: 'navigate',
          detail: 'Đã hiển thị cửa sổ trình duyệt ra Desktop.'
        });
      }
    } catch (err) {
      console.warn('[AdsPower] Lỗi hiển thị cửa sổ:', err.message);
    }
  };
  session.hideWindow = async () => {
    try {
      const activePage = session.mainPage || context.pages().filter(p => !p.isClosed())[0];
      if (!cdpSession && activePage) {
        cdpSession = await context.newCDPSession(activePage);
      }
      if (cdpSession) {
        if (!cdpWindowId) {
          const win = await cdpSession.send('Browser.getWindowForTarget');
          cdpWindowId = win.windowId;
        }
        await hideWindowOffscreen(cdpSession, cdpWindowId);
        session.isWindowVisible = false;
        console.log(`[AdsPower] Slot ${assignedSlot}: Đã thu nhỏ cửa sổ về chạy ngầm.`);
        session.addBrowserLog?.({
          type: 'navigate',
          detail: 'Đã thu nhỏ cửa sổ về chạy ngầm.'
        });
      }
    } catch (err) {
      console.warn('[AdsPower] Lỗi thu nhỏ cửa sổ:', err.message);
    }
  };
  const assignedEmail = await takeNextEmail();
  if (assignedEmail) session.assignedEmail = assignedEmail;
  session.runHidden = Boolean(screenPreviewOnly || hideUntilTarget || hideUntilLead);
  session.trueHeadless = trueHeadless;
  suppressBringToFrontWhileHidden(context, session);
  limitOfferTabs(context, session);
  attachUniqueOfferTabs(context, session);
  attachBrowserLogger(context, session);
  attachBandwidthTracker(context, session);
  if (session.dataSaver !== false) {
    void attachDataSaver(context, session);
  }
  if (useCloakBrowser) {
    // AdsPower chạy SunBrowser (Chromium thường) — chỉ có lớp Humanize (JS) được gắn,
    // KHÔNG phải nhân Chromium vá C++ của CloakBrowser. Không được ghi "C++ Patched".
    session.addLog({
      type: 'cloakbrowser_active',
      detail: cloakHumanizeApplied ? 'Kích hoạt lớp Humanize (mô phỏng chuột/phím) trên SunBrowser của AdsPower.' : 'Yêu cầu bật Humanize trên AdsPower nhưng lớp Humanize không gắn được (xem log cảnh báo).'
    });
  }
  const handleSessionClosed = () => {
    if (session._hasCleanedUp) return;
    session._hasCleanedUp = true;
    session.isClosed = true;
    if (session.leadCheckStatus === 'confirmed' && session.exitIp) {
      saveAndRecordLeadIpStats({
        ip: session.exitIp,
        screen: Math.max(session.screenReached || 1, session.currentScreen || 1, (session.completedScreens || 0) + 1),
        completedScreens: session.completedScreens || 0,
        jumpCount: Math.max(session.pageJumps || 0, session.completedScreens || 0),
        offerNumber: session.offerNumber ?? session.streamRole ?? 1,
        proxy: session.proxyServer || session.proxyKey,
        websiteUrl: session.websiteUrl
      });
    }
    activeBrowsers.delete(session);
    releaseProxyLock(proxy ?? null, session.exitIp);
    if (!proxy) activeExitIpLocks.delete('Direct');
    cdpBrowser.close().catch(() => {});
    void requestManagedProfileStop(session);
    const sc = screencastSessions.get(assignedSlot);
    if (sc) {
      sc.cleaned = true;
      void releaseScreencast(sc);
      try {
        sc.sseResponse.end();
      } catch {}
      screencastSessions.delete(assignedSlot);
    }
    console.log(`[AdsPower] Profile ${profileId} (Slot ${assignedSlot}) đã đóng.`);
    if (!session.suppressAutoRefill && autoRefill.enabled && !autoRefill.stopRequested) {
      const baseDelay = autoRefill.sequential || session.closingDueToNoLead ? 5000 : 0;
      queueAutomaticRefill(baseDelay + delayStop * 1000);
    }
  };
  attachBrowserCloseHandler(session, handleSessionClosed);

  // Điều hướng tới URL offer - hỗ trợ đa luồng dạng đa tab
  const pages = context.pages().filter(p => !p.isClosed());
  const page = pages.length > 0 ? pages[0] : await context.newPage();
  session.mainPage = page;
  page._uxOriginTab = true;
  page._tabIndex = 0;
  page._offerNumber = offer;
  // Khai báo trước khi gán record cho tab (trước đây khai báo phía dưới nên dòng này lỗi TDZ).
  const recordPool = autofillQueue.available.length > 0 ? autofillQueue.available : autofillRecords.length > 0 ? autofillRecords : autofillQueue.used;
  page._assignedRecord = session.currentRecord ? safeCloneRecord(session.currentRecord) : takeNextRecord(recordPool, autofillRecords);
  const tabUrlsToOpen = selectUniqueOfferUrls(offerUrls, websiteUrl);
  const primaryUrl = tabUrlsToOpen[0] || websiteUrl;
  if (primaryUrl) {
    await Promise.race([page.goto(primaryUrl, {
      timeout: navigationTimeout,
      waitUntil: 'domcontentloaded'
    }).catch(() => {}), new Promise(r => setTimeout(r, navigationTimeout + 2000))]);
    const finalNavUrl = typeof page.url === 'function' ? page.url() : '';
    if (isToffersDuplicateOfferUrl(finalNavUrl) && !protectConfirmedLeadSession(session)) {
      console.log(`[ToffersDup] Slot ${assignedSlot}: URL đích trả về lỗi IP đã click (${finalNavUrl}). Đóng profile và bù slot mới.`);
      session.isClosed = true;
      session.suppressAutoRefill = false;
      await page.close().catch(() => {});
      await context.close().catch(() => {});
      await stopProfile(profileId).catch(() => {});
      if (!autoRefill.stopRequested && autoRefill.enabled) queueAutomaticRefill();
      return null;
    }
    if (session.isWindowVisible) {
      await page.bringToFront().catch(() => {});
    }
  }

  // Mở các tab còn lại trong cùng trình duyệt cho chế độ đa luồng đa tab
  if (tabUrlsToOpen.length > 1) {
    for (let t = 1; t < tabUrlsToOpen.length; t++) {
      const tabUrl = tabUrlsToOpen[t];
      try {
        // Tab gốc app tự mở: đánh dấu trước khi mở để limitOfferTabs không đóng nhầm.
        session._uxOpeningOriginTabs = (session._uxOpeningOriginTabs || 0) + 1;
        const extraPage = await context.newPage().finally(() => {
          session._uxOpeningOriginTabs -= 1;
        });
        extraPage._uxOriginTab = true;
        extraPage._tabIndex = t;
        extraPage._uxPlanned = true;
        extraPage._offerNumber = t % (offerUrls.length || 1) + 1;
        extraPage._assignedRecord = takeNextRecord(recordPool, autofillRecords); // mỗi tab một record riêng
        extraPage._uxOriginTab = true;
        await applyOverridesSafely(extraPage);
        if (tabUrl) {
          void extraPage.goto(tabUrl, {
            timeout: navigationTimeout,
            waitUntil: 'domcontentloaded'
          }).catch(() => {});
        }
        console.log(`[MultiTab] Slot ${assignedSlot}: Đã mở Tab ${t + 1} cho đa luồng (${tabUrl}).`);
      } catch (tabErr) {
        console.warn(`[MultiTab] Không mở được Tab ${t + 1}:`, tabErr.message);
      }
    }
  }
  closeChromeWhenLastTabCloses(session);
  watchTrafficBlockedPage(session);
  if (completeText) {
    const needle = completeText.toLowerCase();
    const completeTimer = setInterval(async () => {
      if (page.isClosed()) {
        clearInterval(completeTimer);
        return;
      }
      const found = await page.evaluate(n => (document.body?.innerText || '').toLowerCase().includes(n), needle).catch(() => false);
      if (found) {
        clearInterval(completeTimer);
        applicationState.limitRunCount += 1;
        session.addLog?.({
          time: new Date().toISOString(),
          type: 'complete_text',
          detail: `Text hoàn tất "${completeText}" (${applicationState.limitRunCount}${applicationState.limitRunMax > 0 ? '/' + applicationState.limitRunMax : ''}).`
        });
        if (applicationState.limitRunMax > 0 && applicationState.limitRunCount >= applicationState.limitRunMax) void tgNotify(`🎉 <b>Hoàn thành!</b> Đạt ${applicationState.limitRunCount}/${applicationState.limitRunMax} leads. Luồng đã dừng.`);
        if (protectConfirmedLeadSession(session)) return;
        session.suppressAutoRefill = false;
        await session.browser?.close?.().catch(() => {});
      }
    }, 2000);
    context.on('close', () => clearInterval(completeTimer));
  }
  if (timeLimit > 0) {
    const timeLimitTimer = setTimeout(() => {
      session.addLog?.({
        time: new Date().toISOString(),
        type: 'time_limit',
        detail: `Đã chạy ${timeLimit}s; giữ trình duyệt mở khi tác vụ vẫn đang hoạt động.`
      });
    }, timeLimit * 1000);
    context.on('close', () => clearTimeout(timeLimitTimer));
  }
  if (scriptSteps?.length > 0) {
    void (async () => {
      await page.waitForLoadState('domcontentloaded', {
        timeout: navigationTimeout
      }).catch(() => {});
      const record = session.currentRecord ?? autofillRecords[0] ?? {};
      await runScript(page, scriptSteps, record, {
          session,
        captchaApiKey,
        scriptDir: scriptPath ? dirname(scriptPath) : '',
        logger: entry => session.addLog?.({
          time: new Date().toISOString(),
          ...entry
        })
      });
    })();
  }

  // Lấy từ queue available; nếu cạn thì tái dùng record đã dùng (used) thay vì chạy rỗng
  if (autofillQueue.available.length === 0 && recordPool.length > 0) {
    void session.addLog?.({
      type: 'record_pool_reuse',
      detail: `Hàng đợi record đã cạn (available=0) — tự động tái dùng lại ${recordPool.length} record đã dùng. Bấm "Đặt lại" trong tab Proxy nếu muốn làm mới.`
    });
  }
  if (websiteUrl) {
    // Lưu flag để /state hiển thị đúng trạng thái check lead của phiên
    session.enableLeadCheck = leadConfig.enabled === true;
    const manualOpsRecorder = startManualOpsRecorder(context, session, appDataDirectory, { onLog: (entry, page) => session.addBrowserLog?.(entry, page) });
    await manualOpsRecorder.ready;
    attachAutofill(context, recordPool, new URL(websiteUrl).origin, session, {
      manualOpsRecorder,
      offerStrategy: offerStrategyState.get(session.offerNumber ?? session.streamRole ?? 1) ?? null,
      autoSubmit,
      enableLeadCheck: leadConfig.enabled === true,
      leadCheckScreen: leadConfig.checkScreen || 4,
      /**
       * Ghi log autofill cùng tab nguồn để lưu đúng giao diện của luồng hiện tại.
       * @param {object} entry Sự kiện autofill cần ghi.
       * @param {object|null} page Tab Playwright phát sinh sự kiện.
       * @return {void} Ghi sự kiện vào lịch sử phiên.
       * @author ductv <ductv@getflycrm.com>
       * @since 2026-10-21
       */
      onLog: (entry, page) => {
        if (session.hideUntilLead && entry && entry.type === 'lead_confirmed') {
          void session.showWindow?.(true);
        }
        session.addBrowserLog?.(entry, page);
      },
      onFormRejected: (sess, info) => handleFormRejected(sess, info),
      onRecordPicked: record => {
        // Tab chính đã nhận record riêng (takeNextRecord) trước khi gắn autofill: dùng luôn, không rút thêm record.
        if (session.mainPage?._assignedRecord) {
          session.currentRecord = session.mainPage._assignedRecord;
          return;
        }
        // Giữ nguyên trạng thái chạy ngầm trong app, không tự ý bung cửa sổ Desktop
        if (session.assignedEmail && record) {
          record.email = session.assignedEmail;
          record.emailaddress = session.assignedEmail;
          record.mail = session.assignedEmail;
          record.assignedEmail = session.assignedEmail;
        }
        session.currentRecord = record;
        // Đưa record GỐC (chưa gắn email phiên) vào danh sách đã dùng: trước đây đẩy bản đã gắn email,
        // nên khi tái dùng danh sách đã dùng, phiên khác nhận luôn email của phiên này.
        const idx = autofillQueue.available.findIndex(r => r === record || autofillRecordIdentity(r) === autofillRecordIdentity(record));
        const original = idx !== -1 ? autofillQueue.available.splice(idx, 1)[0] : null;
        if (original) {
          autofillQueue.used.push(original);
          void saveAutofillQueue();
        }
        void markAutofillRecordUsed(original ?? withoutSessionEmail(record));
      },
      onScreen5Reached: (sess, p) => {
        if (sess?.emailFilled) void startLeadVerification(sess, leadConfig);
      },
      onEmailSubmitted: (sess, p) => {
        if (sess?.emailFilled) void startLeadVerification(sess, leadConfig);
      },
      onScreenAdvanced: (sess, screen, jumps) => {
        if (sess.leadCheckStatus === 'confirmed' && sess.exitIp) {
          saveAndRecordLeadIpStats({
            ip: sess.exitIp,
            screen,
            completedScreens: sess.completedScreens,
            jumpCount: jumps,
            offerNumber: sess.offerNumber ?? sess.streamRole ?? 1,
            proxy: sess.proxyServer || sess.proxyKey,
            websiteUrl: sess.websiteUrl
          });
        }
      },
      onPageJump: (sess, jumps, url) => {
        if (sess.leadCheckStatus === 'confirmed' && sess.exitIp) {
          saveAndRecordLeadIpStats({
            ip: sess.exitIp,
            screen: Math.max(sess.screenReached || 1, sess.currentScreen || 1, (sess.completedScreens || 0) + 1),
            completedScreens: sess.completedScreens || 0,
            jumpCount: jumps,
            offerNumber: sess.offerNumber ?? sess.streamRole ?? 1,
            proxy: sess.proxyServer || sess.proxyKey,
            websiteUrl: sess.websiteUrl
          });
        }
      },
      onStuck: p => {
        // Tab nào cũng phải chạy! Không chặn p !== session.mainPage
        if (p._aiAssistRunning) return;
        const currentUrl = p.url?.() || '';
        if (!currentUrl || currentUrl.startsWith('about:') || currentUrl.startsWith('chrome:') || currentUrl.includes('api.ipify.org')) return;
        const now = Date.now();
        if (p._lastAiUrl === currentUrl && now - (p._lastAiTime || 0) < 4000) return;
        p._lastAiUrl = currentUrl;
        p._lastAiTime = now;
        const currentRecord = p._assignedRecord ?? session.currentRecord ?? safeCloneRecord(autofillRecords[0]) ?? {};
        if (session.assignedEmail && currentRecord) {
          currentRecord.email = session.assignedEmail;
          currentRecord.emailaddress = session.assignedEmail;
          currentRecord.mail = session.assignedEmail;
          currentRecord.assignedEmail = session.assignedEmail;
        }
        void runAiAssist(p, currentRecord, session, {
          onLog: e => session.addLog?.(e)
        }).then(() => resumeAutofillAfterAi(p, session));
      }
    });
  }
  return session;
}
