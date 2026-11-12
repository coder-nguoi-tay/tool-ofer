import { attachUniqueOfferTabs } from '../tabs/attach-unique-offer-tabs.mjs';
import { selectUniqueOfferUrls } from '../tabs/select-unique-offer-urls.mjs';
import { resumeAutofillAfterAi } from './resume-autofill-after-ai.mjs';
import { attachBrowserCloseHandler } from './attach-browser-close-handler.mjs';
import { protectConfirmedLeadSession } from '../../leads/actions/protect-confirmed-lead-session.mjs';
import { DEVICE_PROFILES } from '../../runtime/constants/device-profiles.mjs';
import { activeBrowsers } from '../sessions.mjs';
import { appDataDirectory } from '../../config/paths.mjs';
import { applicationState } from '../../runtime/application-state.mjs';
import { applyNativeOverrides } from '../../../stealth.mjs';
import { attachAutofill } from '../../../autofill.mjs';
import { attachBandwidthTracker } from '../../monitoring/bandwidth.mjs';
import { attachBrowserLogger } from './attach-browser-logger.mjs';
import { attachDataSaver } from '../data-saver.mjs';
import { attachFullHtmlLoggerToBrowser } from '../../logging/html-capture.mjs';
import { attachFullHtmlLoggerToContext } from '../../logging/html-capture.mjs';
import { attachGuardedWorkerInjection } from '../../../stealth.mjs';
import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { autofillQueue } from '../../runtime/constants/autofill-queue.mjs';
import { autofillRecordIdentity } from '../../records/actions/autofill-record-identity.mjs';
import { browserProfilePath } from './browser-profile-path.mjs';
import { browserSessionLogs } from '../../logging/browser-logs.mjs';
import { isClosedTargetError } from './is-closed-target-error.mjs';
import { buildBrandLists } from '../../../stealth.mjs';
import { buildStealthConfig } from '../../../stealth.mjs';
import { buildUserAgentOverride } from '../../../stealth.mjs';
import { chromium } from 'playwright';
import { closeChromeWhenLastTabCloses } from './close-chrome-when-last-tab-closes.mjs';
import { createDeviceVariant } from '../../../stealth.mjs';
import { dirname } from 'node:path';
import { executeFile } from '../../runtime/constants/execute-file.mjs';
import { getCloakBrowserStatus } from '../../../cloakbrowser-engine.mjs';
import { getDeadOrBlockedReason } from "../../leads/page-health/get-dead-or-blocked-reason.mjs";
import { handleFormRejected } from "../../records/actions/handle-form-rejected.mjs";
import { hideWindowOffscreen } from './hide-window-offscreen.mjs';
import { launchCloakBrowserPersistentContext } from '../../../cloakbrowser-engine.mjs';
import { limitOfferTabs } from "../tabs/limit-offer-tabs.mjs";
import { listProfileExtensionNames } from '../chrome-profiles.mjs';
import { localeForCountry } from '../../../stealth.mjs';
import { markAutofillRecordUsed } from '../../records/actions/mark-autofill-record-used.mjs';
import { mkdir } from 'node:fs/promises';
import { navigationTimeout } from '../../runtime/constants/navigation-timeout.mjs';
import { offerStrategyState } from '../../runtime/constants/offer-strategy-state.mjs';
import { pickConfiguredUserAgent } from "../user-agents/pick-configured-user-agent.mjs";
import { queueAutomaticRefill } from '../../refill/actions/queue-automatic-refill.mjs';
import { readConfiguredUserAgents } from "../user-agents/read-configured-user-agents.mjs";
import { releaseProxyLock } from '../../proxy/actions/release-proxy-lock.mjs';
import { releaseScreencast } from '../screencast.mjs';
import { removeChromeSessionProfile } from '../chrome-profiles.mjs';
import { requestProxyIpInfo } from '../../proxy/actions/request-proxy-ip-info.mjs';
import { runAiAssist } from '../../../ai-assist.mjs';
import { runScript } from '../../../script.mjs';
import { safeCloneRecord } from '../../records/actions/safe-clone-record.mjs';
import { saveAndRecordLeadIpStats } from "../../leads/statistics/save-and-record-lead-ip-stats.mjs";
import { saveAutofillQueue } from '../../records/actions/save-autofill-queue.mjs';
import { screencastSessions } from '../../runtime/constants/screencast-sessions.mjs';
import { seedChromeProfileFromTemplate } from '../chrome-profiles.mjs';
import { startAuthenticatedSocksRelay } from '../../../relay.mjs';
import { startLeadVerification } from '../../leads/actions/start-lead-verification.mjs';
import { startManualOpsRecorder } from '../../../observer.mjs';
import { stealthInitScript } from '../../../stealth.mjs';
import { suppressBringToFrontWhileHidden } from "../window/suppress-bring-to-front-while-hidden.mjs";
import { takeNextEmail } from '../../queues/email.mjs';
import { takeNextRecord } from '../../records/actions/take-next-record.mjs';
import { toPlaywrightProxy } from '../../proxy/configuration.mjs';
import { verifyBrowserExitIp } from '../../proxy/actions/verify-browser-exit-ip.mjs';
import { verifyPageProfileCoherence } from '../../../stealth.mjs';
import { watchTrafficBlockedPage } from '../../leads/actions/watch-traffic-blocked-page.mjs';
import { withoutSessionEmail } from '../../records/actions/without-session-email.mjs';

/**
 * Mở phiên Chrome với proxy riêng, kiểm tra IP và gắn các tác vụ tự động của phiên.
 * @param {object} options options.
 * @return {Promise<*>} Kết quả xử lý open browser with installed chrome.
 * @throws {Error} Khi dữ liệu không hợp lệ hoặc thao tác không thể hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function openBrowserWithInstalledChrome({
  build,
  proxy,
  proxyKey,
  websiteUrl,
  usedExitIps,
  onExitIp,
  tile,
  tileIndex,
  autofillRecords,
  autoSubmit = true,
  leadConfig = {},
  deviceProfile = 'windows',
  streamRole = 1,
  streamLabel = '',
  offerNumber = 1,
  scriptSteps = null,
  captchaApiKey = '',
  completeText = '',
  timeLimit = 0,
  delayStop = 0,
  scriptPath = '',
  antiFingerprint = {},
  checkDuplicate = true,
  hideUntilTarget = false,
  hideUntilLead = false,
  offerUrls = [],
  threadCount = 1,
  multiTab = true,
  useCloakBrowser = false,
  screenPreviewOnly = true,
  dataSaver = true
}) {
  // Chromium không mở an toàn profile đã được Chrome phiên bản mới hơn khởi tạo.
  // CloakBrowser có engine riêng; không dùng chung profile Chrome hay seed từ template Chrome.
  const cloakVersion = useCloakBrowser ? getCloakBrowserStatus().version : null;
  if (useCloakBrowser && !cloakVersion) {
    throw new Error('Không xác định được phiên bản CloakBrowser để tạo profile riêng.');
  }
  const userDataDirectory = browserProfilePath(build, proxyKey, useCloakBrowser ? cloakVersion : null);
  const templateSkipReason = useCloakBrowser ? 'CloakBrowser dùng profile riêng, không sao chép profile Chrome khác phiên bản' : await seedChromeProfileFromTemplate(userDataDirectory, build);
  const extensionNames = await listProfileExtensionNames(userDataDirectory);
  await mkdir(userDataDirectory, {
    recursive: true,
    mode: 0o700
  });
  let timezoneId;
  let ipCountry;
  let ipLat = 0,
    ipLng = 0;
  try {
    // Thử lại một lần: thiếu thông tin IP thì múi giờ/ngôn ngữ rơi về của máy thật, lệch với IP proxy.
    const ipInfo = await requestProxyIpInfo(proxy).catch(() => requestProxyIpInfo(proxy));
    if (typeof ipInfo.timezone === 'string' && ipInfo.timezone.includes('/')) timezoneId = ipInfo.timezone;
    if (typeof ipInfo.country === 'string') ipCountry = ipInfo.country;
    if (typeof ipInfo.loc === 'string') {
      const parts = ipInfo.loc.split(',').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) [ipLat, ipLng] = parts;
    }
  } catch {
    // Không tra được múi giờ không chặn việc xác minh IP trong trình duyệt.
  }
  const relay = proxy.server.startsWith('socks5://') && proxy.username ? await startAuthenticatedSocksRelay(proxy) : null;
  // Mỗi phiên một seed: từ đó bốc ra một máy cụ thể (chip/GPU, nhân CPU, màn hình, bản OS) và nhiễu canvas/audio riêng.
  const sessionSeed = Math.floor(Math.random() * 0x7fffffff) || 1;
  const tileViewport = {
    width: tile.width,
    height: Math.max(600, tile.height - 85)
  };
  // Chạy đúng thiết bị được tích (Windows, macOS, Linux, Android, iPhone, iPad).
  // Toffers ghi "Version click = 0" khi thiếu Sec-CH-UA-Platform-Version trên redirect, không phải vì OS:
  // applyNativeOverrides bù header này cho mọi bước điều hướng (Windows 10.0.0, macOS 14-26, Linux 6.x).
  const requestedProfile = DEVICE_PROFILES[deviceProfile] ? deviceProfile : 'windows';
  // CloakBrowser giả nền tảng ở tầng engine (--fingerprint-platform) cho windows/macos; profile khác đi theo
  // OS máy đang chạy như trước, để UA/Client Hints và navigator.platform không mâu thuẫn.
  const cloakPlatform = ['windows', 'macos'].includes(requestedProfile) ? requestedProfile : process.platform === 'darwin' ? 'macos' : 'windows';
  const profileKey = useCloakBrowser ? cloakPlatform : requestedProfile;
  const dp = createDeviceVariant(profileKey, DEVICE_PROFILES[profileKey], sessionSeed, {
    width: tileViewport.width,
    height: tileViewport.height + 90
  });
  // UA trong tab Useragent (nếu có) thay mẫu cố định. CloakBrowser tự quản UA nên bỏ qua.
  const configuredUa = useCloakBrowser ? null : pickConfiguredUserAgent(await readConfiguredUserAgents(profileKey), sessionSeed);
  if (configuredUa) {
    dp.ua = configuredUa;
    // Android: Client Hints phải cùng model/bản Android với UA, nếu không trang thấy hai thiết bị khác nhau.
    const android = /Android (\d+)[^;)]*; ([^;)]+)\)/.exec(configuredUa(''));
    if (android && dp.uaData) dp.uaData = {
      ...dp.uaData,
      platformVersion: `${android[1]}.0.0`,
      model: android[2].trim()
    };
    const win = /Windows NT (\d+\.\d+)/.exec(configuredUa(''));
    if (win && dp.uaData) dp.uaData = {
      ...dp.uaData,
      platformVersion: `${win[1]}.0`,
      platform: 'Windows'
    };
  }
  // Engine CloakBrowser có version riêng (vd 145.x), khác Chrome đã cài (154/155).
  // UA và Client Hints phải theo đúng version engine, nếu không site thấy UA 154 nhưng engine là 145.
  const effectiveBuild = useCloakBrowser ? {
    ...build,
    version: cloakVersion,
    channel: 'cloakbrowser'
  } : build;
  const effectiveUa = dp.ua(effectiveBuild.version);
  // Ngôn ngữ khớp quốc gia của IP, cùng nguồn với múi giờ.
  const {
    locale,
    languages
  } = localeForCountry(ipCountry);
  const geolocation = antiFingerprint.apiFakeIP && (ipLat || ipLng) ? {
    latitude: ipLat,
    longitude: ipLng,
    accuracy: 20 + Math.floor(Math.random() * 60)
  } : null;
  const effectiveProxyUrl = relay?.proxy?.server || proxy?.server || '';
  const protectWebRtc = Boolean(antiFingerprint?.webrtc);
  const webrtcPolicy = protectWebRtc || effectiveProxyUrl ? 'disable_non_proxied_udp' : 'default';
  const brandLists = buildBrandLists(effectiveBuild.version, 'Google Chrome');
  const secChUaHeader = brandLists.brands.map(b => `"${b.brand}";v="${b.version}"`).join(', ');
  if (dp.uaData) {
    dp.uaData.brands = brandLists.brands;
    dp.uaData.fullVersionList = brandLists.fullVersionList;
  }
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
  let context;
  let verifiedExitIp = null;
  // Chạy có cửa sổ hay không: "Chạy trong app" BẬT (hoặc ẩn-tới-target/lead) = headless ẩn hoàn toàn,
  // người dùng xem qua Screen View. TẮT = có cửa sổ Chrome thật hiện ra Desktop.
  const runHeadless = screenPreviewOnly || hideUntilTarget || hideUntilLead;
  // "Chạy trong app" → headless thật: không có cửa sổ, không có icon trên Dock (ưu tiên hơn ẩn-tới-target/lead).
  // Đổi lại nút "Hiện cửa sổ" và việc tự bung cửa sổ khi có lead không còn tác dụng; xem và thao tác qua Screen View.
  const trueHeadless = Boolean(screenPreviewOnly);
  const headlessViewport = dp.viewport ?? tileViewport;
  try {
    if (useCloakBrowser) {
      const cloakVersion = effectiveBuild.version;
      console.log(`[CloakBrowser] Khởi chạy Stealth Chromium ${cloakVersion} (${cloakPlatform}) với profile ${profileKey}, slot ${(tileIndex ?? 0) + 1}`);
      // LƯU Ý: KHÔNG dùng headless thật nữa — headless không tồn tại cửa sổ OS,
      // nút "Hiện cửa sổ" sẽ không bao giờ bung được ra Desktop (bug gốc).
      // Dùng cửa sổ thật + CDP thu nhỏ ngầm ngay khi mở (giống flow AdsPower).
      context = await launchCloakBrowserPersistentContext({
        userDataDir: userDataDirectory,
        headless: trueHeadless,
        viewport: runHeadless ? headlessViewport : null,
        humanize: true,
        userAgent: dp.ua(cloakVersion),
        locale,
        timezoneId,
        timezone: timezoneId,
        proxy: relay?.proxy ?? toPlaywrightProxy(proxy),
        args: [
        // KHÔNG dùng --disable-gpu: CloakBrowser gỡ "--enable-unsafe-swiftshader" khỏi default args
        // (IGNORE_DEFAULT_ARGS) nên nếu còn --disable-gpu thì trang mất hoàn toàn WebGL.
        // Đã đo thực tế: có --disable-gpu -> webgl=false; bỏ đi -> webgl=true.
        // Không truyền "--enable-unsafe-swiftshader": Playwright tự bỏ cờ này khi nằm trong
        // ignoreDefaultArgs, và renderer SwiftShader lại là dấu hiệu fingerprint. Không có --disable-gpu
        // thì WebGL chạy trên GPU thật (ANGLE Metal) — khớp profile macOS và khó phát hiện hơn.
        // Nền tảng do engine quyết định; nêu rõ để không lệch với profile thiết bị đã chọn.
        `--fingerprint-platform=${cloakPlatform}`, '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-ipc-flooding-protection', '--disable-breakpad', '--disable-component-update', '--disable-domain-reliability', '--js-flags=--max-old-space-size=512', '--disk-cache-size=1', '--media-cache-size=1', '--renderer-process-limit=3',
        // Chromium tự bật cờ "do automation" khi điều khiển từ xa — tắt đi cho khớp Chrome thật.
        '--disable-blink-features=AutomationControlled',
        // WebRTC policy theo cấu hình anti-fingerprint (nhất quán với UI/engine khác).
        `--webrtc-ip-handling-policy=${webrtcPolicy}`, ...(protectWebRtc ? ['--fingerprint-webrtc-ip=auto'] : [])],
        contextOptions: {
          ignoreHTTPSErrors: true,
          extraHTTPHeaders: clientHintHeaders,
          ...(geolocation && {
            geolocation,
            permissions: ['geolocation']
          }),
          ...(dp.screen && {
            screen: {
              width: dp.screen.width,
              height: dp.screen.height
            }
          }),
          ...(runHeadless && {
            deviceScaleFactor: dp.deviceScaleFactor ?? 1
          }),
          isMobile: dp.isMobile,
          hasTouch: dp.hasTouch
        },
        launchOptions: {
          // CloakBrowser tự đặt ignoreDefaultArgs; Playwright mặc định vẫn thêm --disable-extensions
          // nên extension trong profile mẫu (RoboForm) không bao giờ nạp. Ghi đè danh sách này,
          // giữ lại đúng hai cờ chống lộ automation của CloakBrowser.
          ignoreDefaultArgs: ['--enable-automation', '--enable-unsafe-swiftshader', '--disable-extensions']
        }
      });
    } else {
      // LƯU Ý: KHÔNG dùng headless thật nữa — headless không có cửa sổ OS để "Hiện cửa sổ" bung ra.
      // Cài giảm runHeadless vẫn mở cửa sổ thật nhưng bị thu nhỏ ngầm ngay khi mở.
      context = await chromium.launchPersistentContext(userDataDirectory, {
        executablePath: build.executablePath,
        ignoreDefaultArgs: ['--enable-automation', '--enable-unsafe-swiftshader', '--disable-extensions', '--disable-background-networking', '--disable-component-update'],
        headless: trueHeadless,
        viewport: runHeadless ? headlessViewport : null,
        ...(dp.screen && {
          screen: {
            width: dp.screen.width,
            height: dp.screen.height
          }
        }),
        ignoreHTTPSErrors: true,
        userAgent: dp.ua(build.version),
        locale,
        isMobile: dp.isMobile,
        hasTouch: dp.hasTouch,
        ...(runHeadless && {
          deviceScaleFactor: dp.deviceScaleFactor ?? 1
        }),
        proxy: relay?.proxy ?? toPlaywrightProxy(proxy),
        ...(timezoneId && {
          timezoneId
        }),
        // Toạ độ theo IP proxy qua API của Playwright: quyền geolocation và vị trí trả về khớp nhau.
        ...(geolocation && {
          geolocation,
          permissions: ['geolocation']
        }),
        extraHTTPHeaders: clientHintHeaders,
        args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled', `--user-agent=${effectiveUa}`,
        // WebRTC policy theo cấu hình anti-fingerprint (nhất quán với UI/engine khác).
        `--webrtc-ip-handling-policy=${webrtcPolicy}`,
        // KHÔNG dùng --disable-gpu và --enable-unsafe-swiftshader:
        // Tránh lộ card ảo SwiftShader Device (dấu hiệu bot đỏ của Cloudflare/CreepJS).
        // Cho phép WebGL chạy trên GPU thật (ANGLE Metal trên Mac) — khớp 100% profile người dùng thật.
        // KHÔNG dùng --disable-frame-rate-limit: bỏ giới hạn vẽ ở MỌI cửa sổ, 15+ luồng tranh nhau CPU/GPU
        // làm cả máy lẫn luồng hình trong app kém mượt. gpu-rasterization/zero-copy trên Mac vốn đã bật sẵn.
        '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-ipc-flooding-protection', '--disable-breakpad', '--disable-component-update', '--disable-background-networking', '--autoplay-policy=user-gesture-required', '--disable-domain-reliability', '--js-flags=--max-old-space-size=512', '--disk-cache-size=1', '--media-cache-size=1', '--renderer-process-limit=3']
      });
    }
  } catch (error) {
    await relay?.close();
    throw error;
  }
  const actualOfferNumber = Number(offerNumber) || Number(streamRole) || 1;
  const session = {
    browser: context,
    tileIndex,
    slot: (tileIndex ?? 0) + 1,
    enableLeadCheck: leadConfig.enabled === true,
    dataSaver: Boolean(dataSaver),
    chromeVersion: useCloakBrowser ? `CloakBrowser ${effectiveBuild.version}` : build.version,
    // Nhánh CloakBrowser phải lưu profile đã chuẩn hoá (macos/windows) cho khớp engine;
    // nhánh Chrome thường giữ nguyên giá trị thô như trước đây để không đổi hành vi.
    deviceProfile: useCloakBrowser ? profileKey : deviceProfile,
    deviceVersion: dp.deviceVersion || (dp.summary ? dp.summary.split(' · ')[0] : dp.label),
    deviceSummary: useCloakBrowser ? `${dp.summary} · CloakBrowser Stealth` : dp.summary,
    useCloakBrowser: Boolean(useCloakBrowser),
    suppressAutoRefill: false,
    proxyKey,
    proxyServer: proxy.server,
    websiteUrl,
    streamRole,
    streamLabel: streamLabel || `Offer ${actualOfferNumber}`,
    offerNumber: actualOfferNumber,
    hideUntilTarget: Boolean(hideUntilTarget),
    hideUntilLead: Boolean(hideUntilLead),
    hasShownWindow: false,
    confirmedLeadIp: null,
    leadCheckStatus: null,
    leadCheckMessage: null,
    bandwidthBytes: 0,
    bytesSent: 0,
    bytesReceived: 0,
    requestCount: 0,
    bandwidthFormatted: '0 B',
    extensions: extensionNames.length > 0 ? extensionNames.join(', ') : `không có (${templateSkipReason ?? 'profile mẫu chưa cài extension nào'})`,
    // Trạng thái hiển thị trong giao diện AutoLead (leadCheckMessage), không ghi vào trang đích.
    updateBadge: text => {
      session.badgeText = text;
    },
    addLog: entry => {
      if (typeof session.addBrowserLog === 'function') {
        session.addBrowserLog(entry);
      } else {
        const logs = browserSessionLogs.get(session);
        if (logs) logs.push({
          time: new Date().toISOString(),
          offer: session.offerNumber,
          ...entry
        });
      }
    }
  };
  const assignedEmail = await takeNextEmail();
  if (assignedEmail) {
    session.assignedEmail = assignedEmail;
  }
  session.runHidden = runHeadless;
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
    session.addLog({
      type: 'cloakbrowser_active',
      detail: `Kích hoạt CloakBrowser Stealth ${effectiveBuild.version} (nhân Chromium vá C++ & Humanize Automation)`
    });
  }

  // Giả lập thiết bị + chống fingerprint: một script duy nhất chạy trong mọi frame, hàm vá trông như native.
  const stealthConfig = buildStealthConfig(dp, antiFingerprint, sessionSeed, effectiveUa);
  await context.addInitScript(stealthInitScript, stealthConfig);
  // UA, Client Hints, navigator.platform, số nhân CPU, ngôn ngữ: đổi tận gốc qua CDP cho từng tab và iframe khác site.
  const nativeOverrides = {
    userAgentOverride: buildUserAgentOverride(dp, effectiveBuild, languages),
    hardwareConcurrency: dp.spoof.hardwareConcurrency,
    timezoneId,
    deviceProfile: dp,
    clientHintHeaders
  };
  const overrideTasks = new WeakMap();
  const applyDeviceOverrides = targetPage => {
    if (!overrideTasks.has(targetPage)) {
      overrideTasks.set(targetPage, (async () => {
        await applyNativeOverrides(context, targetPage, nativeOverrides).catch(error => {
          // Tab đóng giữa chừng (popup tự đóng, đổi proxy) là va chạm vô hại: không ghi cảnh báo nhiễu.
          if (!isClosedTargetError(error, targetPage)) console.warn(`[Stealth] Không áp được override cho tab: ${error.message}`);
        });
        if (antiFingerprint?.workerInjection) {
          await attachGuardedWorkerInjection(context, targetPage, stealthConfig, {
            enabled: true,
            onLog: entry => session.addBrowserLog?.(entry, targetPage)
          }).catch(() => {});
        }
      })());
    }
    return overrideTasks.get(targetPage);
  };
  context.on('page', newPage => {
    void applyDeviceOverrides(newPage);
  });
  await Promise.all(context.pages().map(applyDeviceOverrides));

  // Kiểm tra tính nhất quán profile (coherence) trên tab chính
  const initialPage = context.pages()[0];
  if (initialPage) {
    void verifyPageProfileCoherence(initialPage, dp, antiFingerprint, {
      timezoneId,
      languages,
      onLog: entry => session.addBrowserLog?.(entry, initialPage)
    }).catch(() => {});
  }

  // Lấy từ queue available; nếu cạn thì tái dùng record đã dùng (used) thay vì chạy rỗng
  const recordPool = autofillQueue.available.length > 0 ? autofillQueue.available : autofillRecords.length > 0 ? autofillRecords : autofillQueue.used;
  if (autofillQueue.available.length === 0 && recordPool.length > 0) {
    void session.addLog?.({
      type: 'record_pool_reuse',
      detail: `Hàng đợi record đã cạn (available=0) — tự động tái dùng lại ${recordPool.length} record đã dùng. Bấm "Đặt lại" trong tab Proxy nếu muốn làm mới.`
    });
  }
  // Lưu flag để /state hiển thị đúng trạng thái check lead của phiên
  session.enableLeadCheck = leadConfig.enabled === true;
  const manualOpsRecorder = startManualOpsRecorder(context, session, appDataDirectory, { onLog: (entry, page) => session.addBrowserLog?.(entry, page) });
  await manualOpsRecorder.ready;
  attachAutofill(context, recordPool, new URL(websiteUrl).origin, session, {
    offerStrategy: offerStrategyState.get(session.offerNumber ?? session.streamRole ?? 1) ?? null,
    manualOpsRecorder,
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
      // Không tự ý bung cửa sổ khi điền form
      if (session.assignedEmail && record) {
        record.email = session.assignedEmail;
        record.emailaddress = session.assignedEmail;
        record.mail = session.assignedEmail;
        record.assignedEmail = session.assignedEmail;
      }
      session.currentRecord = record; // lưu để AI assist dùng khi cần
      // Dequeue ngay khi chọn; đưa record GỐC (chưa gắn email phiên) vào danh sách đã dùng.
      const idx = autofillQueue.available.findIndex(r => r === record || autofillRecordIdentity(r) === autofillRecordIdentity(record));
      const original = idx !== -1 ? autofillQueue.available.splice(idx, 1)[0] : null;
      if (original) {
        autofillQueue.used.push(original);
        void saveAutofillQueue();
      }
      void markAutofillRecordUsed(original ?? withoutSessionEmail(record));
    },
    onScreen5Reached: (sess, page) => {
      if (sess?.emailFilled) void startLeadVerification(sess, leadConfig);
    },
    onEmailSubmitted: (sess, page) => {
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
    onStuck: page => {
      // Tab nào cũng phải chạy! Không chặn page !== session.mainPage
      if (page._aiAssistRunning) return;
      const currentUrl = page.url?.() || '';
      if (!currentUrl || currentUrl.startsWith('about:') || currentUrl.startsWith('chrome:') || currentUrl.includes('api.ipify.org') || currentUrl.includes('toffers.top/click')) {
        return;
      }
      const now = Date.now();
      // Chống spam AI theo từng tab:
      if (page._lastAiUrl === currentUrl && now - (page._lastAiTime || 0) < 4000) {
        return;
      }
      page._lastAiUrl = currentUrl;
      page._lastAiTime = now;
      const currentRecord = page._assignedRecord || session.currentRecord || safeCloneRecord(recordPool[session.recordIndex] ?? recordPool[0]);
      if (session.assignedEmail && currentRecord) {
        currentRecord.email = session.assignedEmail;
        currentRecord.emailaddress = session.assignedEmail;
        currentRecord.mail = session.assignedEmail;
        currentRecord.assignedEmail = session.assignedEmail;
      }
      void runAiAssist(page, currentRecord, session, {
        onLog: entry => session.addLog?.(entry)
      }).then(() => resumeAutofillAfterAi(page, session));
    }
  });
  activeBrowsers.add(session);
  try {
    if (session.browser) attachFullHtmlLoggerToContext(session.browser);
  } catch {}
  try {
    if (session._cdpBrowser) attachFullHtmlLoggerToBrowser(session._cdpBrowser);
  } catch {}

  // Nếu stop được bấm trong lúc browser đang khởi động → đóng ngay
  if (autoRefill.stopRequested) {
    session.suppressAutoRefill = true;
    session.isClosed = true;
    await context.close().catch(() => {});
    return null;
  }
  attachBrowserCloseHandler(session, () => {
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
    releaseProxyLock(proxy, session.exitIp);
    void relay?.close();
    const _slot = session.slot ?? tileIndex + 1;
    const _sc = screencastSessions.get(_slot);
    if (_sc) {
      _sc.cleaned = true;
      void releaseScreencast(_sc);
      try {
        _sc.sseResponse.end();
      } catch {}
      screencastSessions.delete(_slot);
    }
    // Profile dùng xong là xoá cả profile và cache: không giữ lại ~179 MB mỗi proxy đã thử.
    void removeChromeSessionProfile(userDataDirectory);
    applicationState.chromeBuildRotationCounter += 1;
    if (!session.suppressAutoRefill && !autoRefill.stopRequested && autoRefill.enabled) {
      if (!session.closingDueToTrafficBlocked) {
        autoRefill.message = `Slot ${tileIndex + 1} (${streamLabel || 'Trình duyệt'}) trống; đang tìm proxy thay thế.`;
      }
      // 5s delay khi chạy tuần tự hoặc khi không có lead; delayStop cộng thêm theo cấu hình script exe
      const baseDelay = autoRefill.sequential || session.closingDueToNoLead ? 5000 : 0;
      queueAutomaticRefill(baseDelay + delayStop * 1000);
    }
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    // Có giới hạn thời gian: một lệnh CDP không trả lời không được làm phiên kẹt trước bước xác minh IP.
    await Promise.race([applyDeviceOverrides(page), new Promise(resolve => setTimeout(resolve, 5000))]);
    let cdpSession = null;
    let cdpWindowId = null;
    try {
      cdpSession = await context.newCDPSession(page);
      const win = await cdpSession.send('Browser.getWindowForTarget');
      cdpWindowId = win.windowId;
      // Chỉ thu nhỏ (chạy ngầm trong app) khi bật "Chạy trong app" hoặc ẩn tới khi có target/lead.
      // Khi tắt "Chạy trong app" → cửa sổ Chrome mở bình thường ra Desktop.
      if (screenPreviewOnly || hideUntilTarget || hideUntilLead) {
        await hideWindowOffscreen(cdpSession, cdpWindowId);
        session.isWindowVisible = false;
        console.log(`[HideBrowser] Slot ${tileIndex + 1}: Chạy ngầm trong app (thu nhỏ cửa sổ Desktop, bấm mới hiện).`);
        session.addBrowserLog?.({
          type: 'navigate',
          detail: 'Chạy ngầm trong app (thu nhỏ cửa sổ Desktop, bấm mới hiện)...'
        });
      } else {
        session.isWindowVisible = true;
        session.hasShownWindow = true;
        console.log(`[ShowBrowser] Slot ${tileIndex + 1}: Mở cửa sổ Chrome bình thường ("Chạy trong app" đang tắt).`);
        session.addBrowserLog?.({
          type: 'navigate',
          detail: 'Mở cửa sổ Chrome bình thường ("Chạy trong app" tắt)...'
        });
      }
    } catch (err) {
      console.warn('[HideBrowser] Lỗi ẩn cửa sổ ban đầu:', err.message);
    }
    session.showWindow = async (force = false) => {
      if (session.trueHeadless) {
        session.addBrowserLog?.({
          type: 'navigate',
          detail: 'Đang chạy headless (Chạy trong app) nên không có cửa sổ để hiện; xem qua Screen View.'
        });
        return;
      }
      session.hasShownWindow = true;
      try {
        const activePage = session.mainPage || page;
        if (!cdpSession && !activePage.isClosed()) {
          cdpSession = await context.newCDPSession(activePage);
        }
        if (cdpSession) {
          if (!cdpWindowId) {
            const win = await cdpSession.send('Browser.getWindowForTarget');
            cdpWindowId = win.windowId;
          }
          const targetWidth = dp.viewport ? dp.viewport.width : tile.width;
          const targetHeight = dp.viewport ? dp.viewport.height + 100 : tile.height;
          await cdpSession.send('Browser.setWindowBounds', {
            windowId: cdpWindowId,
            bounds: {
              left: tile.left,
              top: tile.top,
              width: targetWidth,
              height: targetHeight,
              windowState: 'normal'
            }
          });
          session.isWindowVisible = true;
          if (!activePage.isClosed()) await activePage.bringToFront().catch(() => {});
          console.log(`[ShowWindow] Slot ${tileIndex + 1}: Hiển thị cửa sổ trình duyệt ra Desktop.`);
          session.addBrowserLog?.({
            type: 'navigate',
            detail: 'Hiển thị cửa sổ trình duyệt ra Desktop.'
          });
        }
      } catch (err) {
        console.warn('[ShowWindow] Lỗi hiển thị cửa sổ:', err.message);
      }
    };
    session.hideWindow = async () => {
      try {
        const activePage = session.mainPage || page;
        if (!cdpSession && !activePage.isClosed()) {
          cdpSession = await context.newCDPSession(activePage);
        }
        if (cdpSession) {
          if (!cdpWindowId) {
            const win = await cdpSession.send('Browser.getWindowForTarget');
            cdpWindowId = win.windowId;
          }
          await hideWindowOffscreen(cdpSession, cdpWindowId);
          session.isWindowVisible = false;
          console.log(`[HideBrowser] Slot ${tileIndex + 1}: Đã thu nhỏ cửa sổ về chạy ngầm.`);
          session.addBrowserLog?.({
            type: 'navigate',
            detail: 'Đã thu nhỏ cửa sổ về chạy ngầm.'
          });
        }
      } catch (err) {
        console.warn('[HideBrowser] Lỗi thu nhỏ cửa sổ:', err.message);
      }
    };
    const exitIp = await verifyBrowserExitIp(context, usedExitIps, onExitIp, websiteUrl, checkDuplicate);
    verifiedExitIp = exitIp;
    session.exitIp = exitIp;
    session.streamRole = streamRole;
    session.streamLabel = streamLabel;
    session.websiteUrl = websiteUrl;
    const tabUrlsToOpen = selectUniqueOfferUrls(offerUrls, websiteUrl);
    const primaryUrl = tabUrlsToOpen[0] || websiteUrl;
    const response = await page.goto(primaryUrl, {
      waitUntil: 'domcontentloaded',
      timeout: navigationTimeout
    });
    const finalUrl = page.url();
    if (!response || response.status() >= 400) {
      throw new Error(`website trả HTTP ${response?.status() ?? 'không có phản hồi'}`);
    }
    const deadReason = await getDeadOrBlockedReason(page);
    if (deadReason) {
      throw new Error(`trang đích hiển thị ${deadReason}`);
    }
    session.mainPage = page;
    page._uxOriginTab = true;
    page._tabIndex = 0;
    page._offerNumber = offerNumber;
    page._assignedRecord = session.currentRecord ? safeCloneRecord(session.currentRecord) : takeNextRecord(recordPool, autofillRecords);
    if (session.isWindowVisible) {
      await page.bringToFront().catch(() => {});
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
          await applyDeviceOverrides(extraPage).catch(() => {});
          if (tabUrl) {
            void extraPage.goto(tabUrl, {
              timeout: navigationTimeout,
              waitUntil: 'domcontentloaded'
            }).catch(() => {});
          }
          console.log(`[MultiTab-Chrome] Slot ${(tileIndex ?? 0) + 1}: Đã mở Tab ${t + 1} cho đa luồng (${tabUrl}).`);
        } catch (tabErr) {
          console.warn(`[MultiTab-Chrome] Không mở được Tab ${t + 1}:`, tabErr.message);
        }
      }
    }

    // IP, thiết bị và luồng hiển thị trong giao diện AutoLead; không chèn badge hay sửa tiêu đề trang đích vì script chống bot đọc được.
    context.on('page', newPage => {
      // Guard tab popup KHÔNG thuộc luồng (không phải tab đa luồng được biên định):
      // khảo sát/trang quảng cáo hay "nhảy trang" mở tab mới — đóng tab đó
      // và quay về tab đầu tiên để tiếp tục bấm Continue.
      setTimeout(async () => {
        if (protectConfirmedLeadSession(session) || newPage.isClosed() || newPage === session.mainPage || newPage._uxOriginTab) return;
        try {
          if (newPage._tabIndex !== undefined || newPage._uxPlanned) return;
          const u = newPage.url();
          if (!u || u.startsWith('about:')) return;
          // Chỉ đóng ngay tab quảng cáo rác. Tab mới khác có thể là chính trang offer (offer mở sang tab mới):
          // trước đây "|| true" đóng mọi tab mới sau 3s nên trang đầu của offer bị tắt. Tab không phải offer
          // do watchTrafficBlockedPage đóng sau khi kiểm tra; số tab tối đa do limitOfferTabs giới hạn.
          // (Trước đây gọi isSpamAdUrl chưa khai báo trong file này → lỗi bị nuốt, guard không chạy.)
          if (/galaxystore\.samsung\.com|play\.google\.com\/store|apps\.apple\.com|popads|propellerads|clickadu|trafficjunky|zeroredirect|doubleclick\.net|syndication\.exoclick/i.test(u)) {
            newPage._uxClosedByApp = 'tab quảng cáo rác';
            console.log(`[PopupTab] Tab quảng cáo ngoài luồng (${u}), đóng và quay về tab đầu.`);
            session.addBrowserLog?.({
              type: 'popup_closed',
              url: u,
              title: '[Đóng tab nhảy trang]',
              html: ''
            });
            await newPage.close().catch(() => {});
          }
          const remaining = context.pages().filter(p => !p.isClosed());
          const first = remaining[0];
          if (first) await first.bringToFront().catch(() => {});
        } catch {}
      }, 3000);
      newPage.once('load', () => {});
      newPage.once('close', () => {});

      // Guard tab phụ bị lỗi mạng → đóng tab đó thôi, không đóng cả browser
      newPage.on('load', async () => {
        if (protectConfirmedLeadSession(session) || newPage.isClosed() || newPage === session.mainPage || newPage._uxOriginTab) return;
        try {
          const deadReason = await getDeadOrBlockedReason(newPage);
          if (!deadReason || protectConfirmedLeadSession(session)) return;
          console.log(`[DeadTab] Tab lỗi "${deadReason}" (${newPage.url()}), đóng và giữ trình duyệt.`);
          session.addBrowserLog?.({
            type: 'traffic_blocked',
            detail: `Tab lỗi: ${deadReason}`
          });
          await newPage.close().catch(() => {});
          const remaining = context.pages().filter(p => !p.isClosed());
          if (remaining.length > 0) await (session.mainPage?.isClosed?.() ? remaining[0] : session.mainPage).bringToFront().catch(() => {});
        } catch {}
      });
    });
    closeChromeWhenLastTabCloses(session);
    watchTrafficBlockedPage(session);

    // completeText: đóng Chrome + tăng bộ đếm limitRun khi phát hiện chuỗi hoàn tất trong nội dung trang
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
            detail: `Đã tìm thấy text hoàn tất "${completeText}" (${applicationState.limitRunCount}${applicationState.limitRunMax > 0 ? '/' + applicationState.limitRunMax : ''}).`
          });
          if (protectConfirmedLeadSession(session)) return;
          session.suppressAutoRefill = false;
          await session.browser?.close?.().catch(() => {});
        }
      }, 2000);
      context.on('close', () => clearInterval(completeTimer));
    }

    // timeLimit: ghi nhận mốc thời gian; không đóng phiên khi tác vụ vẫn đang hoạt động.
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

    // Chạy script lệnh exe (SendByName/ClickXpath/ByPassReCaptcha/...) thay cho autofill tự động nếu có cấu hình
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
    return {
      exitIp,
      finalUrl,
      session
    };
  } catch (error) {
    session.suppressAutoRefill = true;
    session.isClosed = true;
    activeBrowsers.delete(session);
    releaseProxyLock(proxy, session.exitIp || verifiedExitIp);
    try {
      await Promise.race([context.close(), new Promise((_, reject) => setTimeout(() => reject(new Error('close timeout')), 2000))]);
    } catch {}
    // QUAN TRỌNG: Force kill ngay tiến trình Chrome của profile này để cửa sổ đóng lập tức 100%, không bị kẹt trên màn hình
    await executeFile('pkill', ['-9', '-f', `user-data-dir.*${proxyKey}`]).catch(() => {});
    await relay?.close().catch(() => {});
    void removeChromeSessionProfile(userDataDirectory);
    throw error;
  }
}
