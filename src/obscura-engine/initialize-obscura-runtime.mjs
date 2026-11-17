import { limitOfferTabs } from '../browser/tabs/limit-offer-tabs.mjs';
import { attachUniqueOfferTabs } from '../browser/tabs/attach-unique-offer-tabs.mjs';
import { attachExtraTabGuards } from '../browser/tabs/attach-extra-tab-guards.mjs';
import { attachDataSaver } from '../browser/data-saver.mjs';
import { attachBandwidthTracker } from '../monitoring/bandwidth.mjs';
import { attachSessionAutofill } from '../browser/actions/attach-session-autofill.mjs';
import { closeChromeWhenLastTabCloses } from '../browser/actions/close-chrome-when-last-tab-closes.mjs';
import { watchTrafficBlockedPage } from '../leads/actions/watch-traffic-blocked-page.mjs';
import { openGoLoginOfferTabs as openSessionOfferTabs } from '../browser/gologin/open-offer-tabs.mjs';
import { attachCompleteTextWatcher } from '../browser/actions/attach-complete-text-watcher.mjs';
import { attachMaxRunTimer } from '../browser/actions/attach-max-run-timer.mjs';
import { captureClickIds } from '../browser/gologin/capture-click-ids.mjs';
import { attachFullHtmlLoggerToBrowser, attachFullHtmlLoggerToContext } from '../logging/html-capture.mjs';
import { startManualOpsRecorder } from '../../observer.mjs';
import { appDataDirectory } from '../config/paths.mjs';
import { autofillQueue } from '../runtime/constants/autofill-queue.mjs';
import { runModeState } from '../runtime/constants/run-mode-state.mjs';
import { runScript } from '../script/run-script.mjs';
import { decorateGoLoginPages } from '../browser/gologin/decorate-profile-pages.mjs';
import { isAccessOnlyLogging } from '../logging/is-access-only-logging.mjs';
import { dirname } from 'node:path';

/**
 * Gắn các tác vụ nghiệp vụ hiện có vào Obscura; reconnect giữ record và không chạy lại script/offer.
 * @param {object} session Phiên Obscura có context, mainPage và hàm đóng thật.
 * @param {object} options Cấu hình offer, autofill, lead, script và giới hạn của bộ cấp phát chung.
 * @param {boolean} reconnect True khi khôi phục CDP trên engine vẫn sống.
 * @return {Promise<void>} Runtime sẵn sàng trên mọi tab được quản lý.
 * @throws {Error} Khi không cấu hình được context hoặc mở offer.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
export async function initializeObscuraRuntime(session, options, reconnect = false) {
  const context = session.browser;
  session.mainPage = context.pages().find(page => !page.isClosed() && page.url() === session.resumeMainUrl) || context.pages().find(page => !page.isClosed()) || await context.newPage();
  await session.configureContext(context);
  session.bindRecordingContext?.(context);
  captureClickIds(session, context);
  if (reconnect) session._bandwidthTrackerAttached = false;
  if (reconnect) await decorateGoLoginPages(session);
  limitOfferTabs(context, session);
  attachUniqueOfferTabs(context, session);
  attachExtraTabGuards(context, session);
  attachBandwidthTracker(context, session);
  if (session.dataSaver) await attachDataSaver(context, session);
  if (!isAccessOnlyLogging()) {
    attachFullHtmlLoggerToContext(context);
    attachFullHtmlLoggerToBrowser(session._cdpBrowser);
  }
  try {
    await startManualOpsRecorder(context, session, appDataDirectory, { onLog: (entry, page) => session.addBrowserLog?.(entry, page) }).ready;
  } catch (error) {
    session.addBrowserLog?.({ type: 'recorder_error', detail: `Không bật được ghi thao tác: ${error.name}.` });
  }
  const records = autofillQueue.available.length ? autofillQueue.available : options.autofillRecords;
  if (!reconnect) await openSessionOfferTabs(session, options.offerUrls || [session.websiteUrl], records);
  else for (const page of context.pages()) page._assignedRecord = session._resumeRecords?.get(page.url()) || session.currentRecord;
  session._resumeRecords ||= new Map();
  for (const page of context.pages()) {
    /**
     * Giữ record của URL và tab chính qua lần nối lại CDP.
     * @return {void}
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-11-17
     */
    const rememberRecord = () => {
      if (page._assignedRecord) session._resumeRecords.set(page.url(), page._assignedRecord);
      if (page === session.mainPage) session.resumeMainUrl = page.url();
    };
    rememberRecord();
    page.on('framenavigated', rememberRecord);
  }
  if (session.isClosed) return;
  closeChromeWhenLastTabCloses(session);
  session.trafficWatcherAttached = false;
  watchTrafficBlockedPage(session);
  attachSessionAutofill(session, records, options.leadConfig, options.autoSubmit);
  session.disposeCompleteTextWatcher?.();
  session.disposeCompleteTextWatcher = attachCompleteTextWatcher(session, session.mainPage, options.completeText, () => session.close());
  if (!reconnect) {
    session.disposeMaxRunTimer = attachMaxRunTimer(session, options.maxRunMinutes, () => session.close());
    if (!runModeState.manual && !['manual', 'skip'].includes(session.offerMode) && options.scriptSteps?.length) {
      void runScript(session.mainPage, options.scriptSteps, session.currentRecord || {}, {
        session, captchaApiKey: options.captchaApiKey, scriptDir: options.scriptPath ? dirname(options.scriptPath) : '',
        logger: entry => session.addBrowserLog?.(entry),
      }).catch(error => session.addBrowserLog?.({ type: 'script_error', detail: `Script Obscura thất bại: ${error.name}.` }));
    }
  }
}
