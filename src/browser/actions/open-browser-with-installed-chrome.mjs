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
import { getDeadOrBlockedReason } from "../../leads/page-health/get-dead-or-blocked-reason.mjs";
import { handleFormRejected } from "../../records/actions/handle-form-rejected.mjs";
import { hideWindowOffscreen } from './hide-window-offscreen.mjs';
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
import { waitForStableProxyIp } from '../../proxy/actions/wait-for-stable-proxy-ip.mjs';
import { runAiAssist } from '../../../ai-assist.mjs';
import { runScript } from '../../../script.mjs';
import { safeCloneRecord } from '../../records/actions/safe-clone-record.mjs';
import { saveAndRecordLeadIpStats } from "../../leads/statistics/save-and-record-lead-ip-stats.mjs";
import { saveAutofillQueue } from '../../records/actions/save-autofill-queue.mjs';
import { screencastSessions } from '../../runtime/constants/screencast-sessions.mjs';
import { seedChromeProfileFromTemplate } from '../chrome-profiles.mjs';
import { startAuthenticatedSocksRelay, startAuthenticatedHttpRelay } from '../../../relay.mjs';
import { recordRelayUsage } from '../../monitoring/bandwidth/record-relay-usage.mjs';
import { startLeadVerification } from '../../leads/actions/start-lead-verification.mjs';
import { startManualOpsRecorder } from '../../../observer.mjs';
import { stealthInitScript } from '../../../stealth.mjs';
import { suppressBringToFrontWhileHidden } from "../window/suppress-bring-to-front-while-hidden.mjs";
import { takeNextEmail } from '../../queues/email.mjs';
import { attachCompleteTextWatcher } from './attach-complete-text-watcher.mjs';
import { attachExtraTabGuards } from '../tabs/attach-extra-tab-guards.mjs';
import { recordConfirmedLeadProgress } from '../../leads/statistics/record-confirmed-lead-progress.mjs';
import { shouldSkipAiOnStuck } from '../../ai-assist/should-skip-ai-on-stuck.mjs';
import { takeNextRecord } from '../../records/actions/take-next-record.mjs';
import { toPlaywrightProxy } from '../../proxy/configuration.mjs';
import { verifyBrowserExitIp } from '../../proxy/actions/verify-browser-exit-ip.mjs';
import { verifyPageProfileCoherence } from '../../../stealth.mjs';
import { watchTrafficBlockedPage } from '../../leads/actions/watch-traffic-blocked-page.mjs';
import { withoutSessionEmail } from '../../records/actions/without-session-email.mjs';
import { attachMaxRunTimer } from './attach-max-run-timer.mjs';

/**
 * Mở phiên Chrome với proxy riêng, kiểm tra IP và gắn các tác vụ tự động của phiên.
 * @param {object} options options.
 * @return {Promise<*>} Kết quả xử lý open browser with installed chrome.
 * @throws {Error} Khi dữ liệu không hợp lệ hoặc thao tác không thể hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
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
  maxRunMinutes = 0,
  delayStop = 0,
  scriptPath = '',
  antiFingerprint = {},
  checkDuplicate = true,
  hideUntilTarget = false,
  hideUntilLead = false,
  offerUrls = [],
  threadCount = 1,
  multiTab = true,
  screenPreviewOnly = true,
  choiceDelay = 0,
  dataSaver = true
}) {
  // Chromium không mở an toàn profile đã được Chrome phiên bản mới hơn khởi tạo.
  const userDataDirectory = browserProfilePath(build, proxyKey);
  const templateSkipReason = await seedChromeProfileFromTemplate(userDataDirectory, build);
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
    // Session proxy mới đổi IP 2 lần trong ~10 giây đầu rồi mới giữ cố định: chờ IP ổn định để múi giờ/ngôn ngữ theo
    // đúng IP trình duyệt sẽ dùng. Không ổn định được thì vẫn lấy lần tra cuối như trước (xác minh trong trình duyệt sau đó).
    const stable = await waitForStableProxyIp(proxy, () => requestProxyIpInfo(proxy).catch(() => null));
    const ipInfo = stable || await requestProxyIpInfo(proxy).catch(() => requestProxyIpInfo(proxy));
    if (typeof ipInfo.timezone === 'string' && ipInfo.timezone.includes('/')) timezoneId = ipInfo.timezone;
    if (typeof ipInfo.country === 'string') ipCountry = ipInfo.country;
    if (typeof ipInfo.loc === 'string') {
      const parts = ipInfo.loc.split(',').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) [ipLat, ipLng] = parts;
    }
  } catch {
    // Không tra được múi giờ không chặn việc xác minh IP trong trình duyệt.
  }
  // Proxy có auth đều qua relay cục bộ: SOCKS5 vì Chrome không gửi auth SOCKS; HTTP (711) để ĐẾM BYTE THẬT tại socket
  // (nghiên cứu 2026-11-13: 711 tính gấp 3–4 lần số Playwright đo). Thêm một hop TCP nội bộ, Chrome vẫn CONNECT như cũ.
  const relay = !proxy.username ? null : proxy.server.startsWith('socks5://') ? await startAuthenticatedSocksRelay(proxy) : await startAuthenticatedHttpRelay(proxy);
  // Mỗi phiên một seed: từ đó bốc ra một máy cụ thể (chip/GPU, nhân CPU, màn hình, bản OS) và nhiễu canvas/audio riêng.
  const sessionSeed = Math.floor(Math.random() * 0x7fffffff) || 1;
  const tileViewport = {
    width: tile.width,
    height: Math.max(600, tile.height - 85)
  };
  // Chạy đúng thiết bị được tích (Windows, macOS, Linux, Android, iPhone, iPad).
  // Toffers ghi "Version click = 0" khi thiếu Sec-CH-UA-Platform-Version trên redirect, không phải vì OS:
  // applyNativeOverrides bù header này cho mọi bước điều hướng (Windows 10.0.0, macOS 14-26, Linux 6.x).
  const profileKey = DEVICE_PROFILES[deviceProfile] ? deviceProfile : 'windows';
  const dp = createDeviceVariant(profileKey, DEVICE_PROFILES[profileKey], sessionSeed, {
    width: tileViewport.width,
    height: tileViewport.height + 90
  });
  // UA trong tab Useragent (nếu có) thay mẫu cố định.
  const configuredUa = pickConfiguredUserAgent(await readConfiguredUserAgents(profileKey), sessionSeed);
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
  const effectiveUa = dp.ua(build.version);
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
  const brandLists = buildBrandLists(build.version, 'Google Chrome');
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
      // KHÔNG dùng --js-flags=--max-old-space-size: trang đọc được performance.memory.jsHeapSizeLimit (352 MB thay vì 4192 MB như Chrome thật).
      // KHÔNG dùng --disable-frame-rate-limit: bỏ giới hạn vẽ ở MỌI cửa sổ, 15+ luồng tranh nhau CPU/GPU
      // làm cả máy lẫn luồng hình trong app kém mượt. gpu-rasterization/zero-copy trên Mac vốn đã bật sẵn.
      '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-ipc-flooding-protection', '--disable-breakpad', '--disable-component-update', '--disable-background-networking', '--autoplay-policy=user-gesture-required', '--disable-domain-reliability', '--disk-cache-size=1', '--media-cache-size=1', '--renderer-process-limit=2', '--disable-smooth-scrolling', '--disable-features=Translate,MediaRouter,OptimizationHints', '--enable-low-res-tiling']
    });
  } catch (error) {
    recordRelayUsage(relay?.readBytes?.());
    await relay?.close();
    throw error;
  }
  const actualOfferNumber = Number(offerNumber) || Number(streamRole) || 1;
  const session = {
    browser: context,
    readRelayBytes: relay?.readBytes,
    tileIndex,
    slot: (tileIndex ?? 0) + 1,
    enableLeadCheck: leadConfig.enabled === true,
    stopAutofillOnLead: leadConfig.enabled === true && leadConfig.stopAutofillOnLead === true,
    dataSaver: Boolean(dataSaver),
    chromeVersion: build.version,
    deviceProfile,
    deviceVersion: dp.deviceVersion || (dp.summary ? dp.summary.split(' · ')[0] : dp.label),
    deviceSummary: dp.summary,
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
    choiceDelay: Number(choiceDelay) || 0,
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

  // Giả lập thiết bị + chống fingerprint: một script duy nhất chạy trong mọi frame, hàm vá trông như native.
  const stealthConfig = buildStealthConfig(dp, antiFingerprint, sessionSeed, effectiveUa);
  await context.addInitScript(stealthInitScript, stealthConfig);
  // UA, Client Hints, navigator.platform, số nhân CPU, ngôn ngữ: đổi tận gốc qua CDP cho từng tab và iframe khác site.
  const nativeOverrides = {
    userAgentOverride: buildUserAgentOverride(dp, build, languages),
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
    choiceDelay: session.choiceDelay,
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
    onScreenAdvanced: (sess, screen, jumps) => recordConfirmedLeadProgress(sess, jumps, screen),
    onPageJump: (sess, jumps) => recordConfirmedLeadProgress(sess, jumps),
    onStuck: page => {
      // Tab nào cũng phải chạy! Không chặn page !== session.mainPage; bỏ qua trang không có form và gọi dồn.
      if (shouldSkipAiOnStuck(page)) return;
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
    recordRelayUsage(relay?.readBytes?.());
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
          // Tab gốc app tự mở: đánh dấu để các watcher không xử lý như popup ngoài luồng.
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
    // Tab quảng cáo rác đóng và quay về tab đầu; tab phụ lỗi mạng chỉ đóng tab đó (dùng chung với GoLogin).
    attachExtraTabGuards(context, session);
    closeChromeWhenLastTabCloses(session);
    watchTrafficBlockedPage(session);

    // completeText: đóng Chrome + tăng bộ đếm limitRun khi phát hiện chuỗi hoàn tất trong nội dung trang
    context.on('close', attachCompleteTextWatcher(session, page, completeText));

    // Ô Chờ tối đa: chạy quá N phút thì tự tắt và bù slot (không tắt phiên đã có lead).

    const cancelMaxRunTimer = attachMaxRunTimer(session, maxRunMinutes);

    context.on('close', cancelMaxRunTimer);

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
    recordRelayUsage(relay?.readBytes?.());
    await relay?.close().catch(() => {});
    void removeChromeSessionProfile(userDataDirectory);
    throw error;
  }
}
