import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startAgentMode } from './src/agents/actions/start-agent-mode.mjs';
import { startLocalInterface } from './src/http/actions/start-local-interface.mjs';

export { proxy711, getCached711Balance, get711Balance, start711BalanceBackgroundPolling, loadProxy711Config, saveProxy711Config, ensure711Token, fetch711WapiToken, ensure711WapiToken, get711ConsumptionChart, add711IpWhitelist, generate711SubuserProxies, fetch711Token, record711BalanceSample } from './src/proxy/provider711.mjs';
export { latestToffersOverview, loadToffersConfig, saveToffersConfig, refreshToffersOverview, startToffersBackgroundPolling } from './src/leads/toffers-overview.mjs';
export { interactionLogDirectory, interactionHtmlDirectory, interactionLogFilePath, browserSessionLogs, persistedBrowserLogs, loadPersistedBrowserLogs, savePersistedBrowserLogs, queueSaveBrowserLogs, countSavedHtmlFiles, openLogsHtmlDirectoryInFinder, createBrowserLogsArchive, clearAllLogsAndHtml, LOG_PURGE_INTERVAL_MS, purgeLogsPeriodically } from './src/logging/browser-logs.mjs';
export { instanceId, dataDirName, baseDataDirectory, appDataDirectory, getAutoLeadPCDir } from './src/config/paths.mjs';
export { seedFileIfMissing } from './src/storage/seed-data.mjs';
export { getAiConfigFilePath, loadAiConfig, saveAiConfigFile } from './src/config/ai.mjs';
export { getTelegramConfigPath, loadTelegramConfig, saveTelegramConfig, sendTelegramTestMessage } from './src/config/telegram.mjs';
export { emailQueuePath, emailQueue, emailAutoRefill, loadEmailQueue, saveEmailQueue, loadEmailAutoRefillConfig, saveEmailAutoRefillConfig, refillEmailBatchFromSource, autoRefillEmailIfNeeded, parseEmailLine, importEmailLines, normalizeQueueEmail, isPlausibleGmail, rejectEmail, takeNextEmail, dequeueNextEmail, initializeEmailQueue } from './src/queues/email.mjs';
export { bandwidthStatsPath, bandwidthDailyStats, formatBytes, getLocalDateKey, loadBandwidthStats, queueSaveBandwidthStats, saveBandwidthStatsSync, getDayStats, recordBandwidthUsage, attachBandwidthTracker } from './src/monitoring/bandwidth.mjs';
export { chromeProfileDirectory, chromeProfileCacheDirectory, installedChromeAppPath, chromeChannelDirectory, chromeRegularBuildDirectory, roboFormExtensionId, chromeTemplateProfileDirectory, chromeTemplateMetadataName, chromeTemplateSkippedNames } from './src/browser/chrome-paths.mjs';
export { chromeExecutableNames, listInstalledChromeChannels } from './src/browser/chrome-installations.mjs';
export { compareChromeVersions, seedChromeProfileFromTemplate, isManagedChromeProfilePath, removeChromeSessionProfile, cleanupStaleProfiles, listProfileExtensionNames } from './src/browser/chrome-profiles.mjs';
export { createViewerHub, releaseScreencast, isWindowMinimized, attachScreencastSession } from './src/browser/screencast.mjs';
export { HEAVY_AD_AND_TRACKER_HOSTS, isImageUrl, isEssentialOfferUrl, isMediaUrl, isHeavyAdOrTrackerUrl, attachDataSaver } from './src/browser/data-saver.mjs';
export { normalizeUrl, safeNormalizeUrl, parseProxyLine, toPlaywrightProxy, rotateProxyIfNeeded, selectProxies } from './src/proxy/configuration.mjs';
export { DEVICE_PROFILES } from './src/runtime/constants/device-profiles.mjs';
export { LEAD_POLL_SECONDS } from './src/runtime/constants/lead-poll-seconds.mjs';
export { MAX_OFFER_TABS } from './src/runtime/constants/max-offer-tabs.mjs';
export { NON_OFFER_WAIT_MS } from './src/runtime/constants/non-offer-wait-ms.mjs';
export { acquireProxyLock } from './src/proxy/actions/acquire-proxy-lock.mjs';
export { activeExitIpLocks } from './src/runtime/constants/active-exit-ip-locks.mjs';
export { activeProxyLocks } from './src/runtime/constants/active-proxy-locks.mjs';
export { autoRefill } from './src/runtime/constants/auto-refill.mjs';
export { browserProfilePath } from './src/browser/actions/browser-profile-path.mjs';
export { buildProxyCheckReport } from './src/proxy/actions/build-proxy-check-report.mjs';
export { buildProxyUsageHistoryCsv } from './src/proxy/actions/build-proxy-usage-history-csv.mjs';
export { buildUsedExitIpList } from './src/proxy/actions/build-used-exit-ip-list.mjs';
export { clearAllProxyQueue } from './src/proxy/actions/clear-all-proxy-queue.mjs';
export { closeActiveBrowsers } from './src/browser/actions/close-active-browsers.mjs';
export { closeChromeWhenLastTabCloses } from './src/browser/actions/close-chrome-when-last-tab-closes.mjs';
export { createProxyUsageKey } from './src/proxy/actions/create-proxy-usage-key.mjs';
export { detectOfferContentInPage } from './src/leads/actions/detect-offer-content-in-page.mjs';
export { deviceProfilesPath } from './src/runtime/constants/device-profiles-path.mjs';
export { dualStreamState } from './src/runtime/constants/dual-stream-state.mjs';
export { dualStreamStatePath } from './src/runtime/constants/dual-stream-state-path.mjs';
export { findDuplicateTabs } from './src/browser/actions/find-duplicate-tabs.mjs';
export { findSelectAtPoint } from "./src/browser/screen/find-select-at-point.mjs";
export { getBandwidthSummary } from './src/runtime/actions/get-bandwidth-summary.mjs';
export { getDeadOrBlockedReason } from "./src/leads/page-health/get-dead-or-blocked-reason.mjs";
export { getNextCollisionFreeProxy } from './src/proxy/actions/get-next-collision-free-proxy.mjs';
export { getNextDeviceProfile } from './src/browser/actions/get-next-device-profile.mjs';
export { getNextProxyForStream } from './src/proxy/actions/get-next-proxy-for-stream.mjs';
export { getNonOfferReason } from './src/leads/actions/get-non-offer-reason.mjs';
export { getProxyUniqueKey } from './src/proxy/actions/get-proxy-unique-key.mjs';
export { hasTrafficBlocked } from './src/leads/actions/has-traffic-blocked.mjs';
export { hideWindowOffscreen } from './src/browser/actions/hide-window-offscreen.mjs';
export { initMultiOfferCursors } from './src/leads/actions/init-multi-offer-cursors.mjs';
export { isExitIpCurrentlyInUse } from './src/proxy/actions/is-exit-ip-currently-in-use.mjs';
export { isProxyCurrentlyActive } from './src/proxy/actions/is-proxy-currently-active.mjs';
export { isProxyUsedByAllOffers } from './src/proxy/actions/is-proxy-used-by-all-offers.mjs';
export { isSessionWorkingOnOffer } from './src/leads/actions/is-session-working-on-offer.mjs';
export { isThankYouUrl } from './src/leads/actions/is-thank-you-url.mjs';
export { isToffersDuplicateOfferUrl } from './src/leads/actions/is-toffers-duplicate-offer-url.mjs';
export { leadStatsPath } from './src/runtime/constants/lead-stats-path.mjs';
export { limitOfferTabs } from "./src/browser/tabs/limit-offer-tabs.mjs";
export { loadDualStreamState } from './src/runtime/actions/load-dual-stream-state.mjs';
export { loadLeadStats } from "./src/leads/statistics/load-lead-stats.mjs";
export { loadOfferStrategies } from './src/leads/actions/load-offer-strategies.mjs';
export { loadSavedDeviceProfiles } from './src/browser/actions/load-saved-device-profiles.mjs';
export { mapWithLimit } from './src/runtime/actions/map-with-limit.mjs';
export { multiOfferState } from './src/runtime/constants/multi-offer-state.mjs';
export { offerStrategyState } from './src/runtime/constants/offer-strategy-state.mjs';
export { pickConfiguredUserAgent } from "./src/browser/user-agents/pick-configured-user-agent.mjs";
export { proxyIdentity } from './src/runtime/actions/proxy-identity.mjs';
export { proxyQueue } from './src/runtime/constants/proxy-queue.mjs';
export { queueAutomaticRefill } from './src/refill/actions/queue-automatic-refill.mjs';
export { queueSaveLeadStats } from "./src/leads/statistics/queue-save-lead-stats.mjs";
export { recommendedMaxAlive } from './src/runtime/actions/recommended-max-alive.mjs';
export { releaseProxyLock } from './src/proxy/actions/release-proxy-lock.mjs';
export { resetDeviceProfileRotation } from './src/browser/actions/reset-device-profile-rotation.mjs';
export { resetMultiOfferState } from './src/leads/actions/reset-multi-offer-state.mjs';
export { safeConfigFileName } from './src/config/actions/safe-config-file-name.mjs';
export { saveAndRecordLeadIpStats } from "./src/leads/statistics/save-and-record-lead-ip-stats.mjs";
export { saveDualStreamState } from './src/runtime/actions/save-dual-stream-state.mjs';
export { saveSavedDeviceProfiles } from './src/browser/actions/save-saved-device-profiles.mjs';
export { shouldRunHeadless } from './src/browser/actions/should-run-headless.mjs';
export { suppressBringToFrontWhileHidden } from "./src/browser/window/suppress-bring-to-front-while-hidden.mjs";
export { syncDualStreamState } from './src/runtime/actions/sync-dual-stream-state.mjs';
export { tileAt } from './src/browser/actions/tile-at.mjs';
export { verifyBrowserExitIp } from './src/proxy/actions/verify-browser-exit-ip.mjs';
export { watchTrafficBlockedPage } from './src/leads/actions/watch-traffic-blocked-page.mjs';
export { withoutSessionEmail } from './src/records/actions/without-session-email.mjs';

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught exception:', err);
  if (err?.code === 'ERR_ASSERTION') throw err;
});

process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled rejection:', reason);
});

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const hubArg = process.argv.find((a) => a.startsWith('--hub='));
  if (hubArg) {
    startAgentMode(hubArg.slice(6)).catch((e) => { console.error(e.message); process.exitCode = 1; });
  } else {
    startLocalInterface().catch((error) => { console.error(error.message); process.exitCode = 1; });
  }
}
