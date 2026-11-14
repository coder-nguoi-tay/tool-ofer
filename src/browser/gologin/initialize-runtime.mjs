import { attachExtraTabGuards } from '../tabs/attach-extra-tab-guards.mjs';
import { attachFullHtmlLoggerToBrowser, attachFullHtmlLoggerToContext } from '../../logging/html-capture.mjs';
import { startManualOpsRecorder } from '../../../observer.mjs';
import { appDataDirectory } from '../../config/paths.mjs';
import { attachCompleteTextWatcher } from '../actions/attach-complete-text-watcher.mjs';
import { decorateGoLoginPages } from './decorate-profile-pages.mjs';
import { configureGoLoginDevice } from './configure-device.mjs';
import { configureGoLoginWindow } from './configure-window.mjs';
import { limitOfferTabs } from '../tabs/limit-offer-tabs.mjs';
import { attachUniqueOfferTabs } from '../tabs/attach-unique-offer-tabs.mjs';
import { attachBandwidthTracker } from '../../monitoring/bandwidth.mjs';
import { attachDataSaver } from '../data-saver.mjs';
import { openGoLoginOfferTabs } from './open-offer-tabs.mjs';
import { closeChromeWhenLastTabCloses } from '../actions/close-chrome-when-last-tab-closes.mjs';
import { watchTrafficBlockedPage } from '../../leads/actions/watch-traffic-blocked-page.mjs';
import { attachGoLoginAutofill } from './attach-autofill.mjs';
import { autofillQueue } from '../../runtime/constants/autofill-queue.mjs';
import { runScript } from '../../script/run-script.mjs';
import { dirname } from 'node:path';

/**
 * Gắn runtime vào context đầu hoặc context CDP khôi phục; reconnect không mở lại link/chạy lại script.
 * @param {object} session Phiên GoLogin giữ nguyên IP/lead/record.
 * @param {object} options Cấu hình offer, form, script và cửa sổ.
 * @param {boolean} reconnect True khi chỉ nối lại điều khiển trên browser còn sống.
 * @return {Promise<void>} Runtime đã gắn vào các tab hiện có.
 * @throws {Error} Khi cấu hình CDP hoặc tạo tab chính thất bại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function initializeGoLoginRuntime(session, options, reconnect = false) {
  const context = session.browser;
  session.mainPage = context.pages().find(page => !page.isClosed() && page.url() === session.resumeMainUrl)
    || context.pages().find(page => !page.isClosed()) || await context.newPage();
  session.mainPage._uxOriginTab = true;
  await configureGoLoginDevice(session);
  await decorateGoLoginPages(session);
  await configureGoLoginWindow(session, session.inAppPreview || session.hideUntilTarget || session.hideUntilLead);
  limitOfferTabs(context, session);
  attachUniqueOfferTabs(context, session);
  attachBandwidthTracker(context, session);
  if (session.dataSaver) void attachDataSaver(context, session);
  // Như Chrome: tab quảng cáo rác/tab phụ lỗi mạng, lưu HTML trang (khi bật gỡ lỗi), ghi thao tác tay để học lại.
  attachExtraTabGuards(context, session);
  attachFullHtmlLoggerToContext(context);
  if (session._cdpBrowser) attachFullHtmlLoggerToBrowser(session._cdpBrowser);
  // Bộ ghi thao tác tay lỗi (vd. nối lại CDP) chỉ ghi log, không làm hỏng phiên.
  try {
    await startManualOpsRecorder(context, session, appDataDirectory, { onLog: (entry, page) => session.addBrowserLog?.(entry, page) }).ready;
  } catch (error) {
    session.addBrowserLog?.({ type: 'recorder_error', source: 'system', detail: `Không bật được ghi thao tác tay: ${error.message}` });
  }
  const records = autofillQueue.available.length ? autofillQueue.available
    : options.autofillRecords.length ? options.autofillRecords : autofillQueue.used;
  if (!reconnect) await openGoLoginOfferTabs(session, options.offerUrls, records);
  else for (const page of context.pages()) page._assignedRecord = session._resumeRecords?.get(page.url()) || session.currentRecord;
  if (session.isClosed) return;
  session._resumeRecords ||= new Map();
  /**
   * Giữ record theo URL mới nhất để nối lại CDP không rút record khác hoặc trộn các tab.
   * @param {object} page Tab thuộc phiên hiện tại.
   * @return {void} Theo dõi URL và lưu record trước khi object tab bị đóng do disconnect.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-14
   */
  function trackRecord(page) {
    const remember = () => {
      if (page._assignedRecord) session._resumeRecords.set(page.url(), page._assignedRecord);
      if (page === session.mainPage) session.resumeMainUrl = page.url();
    };
    remember();
    page.on('framenavigated', remember);
    page.on('close', remember);
  }
  context.pages().forEach(trackRecord);
  context.on('page', trackRecord);
  closeChromeWhenLastTabCloses(session);
  session.trafficWatcherAttached = false;
  watchTrafficBlockedPage(session);
  attachGoLoginAutofill(session, records, options.leadConfig, options.autoSubmit);
  // Complete text như Chrome: thấy chuỗi hoàn tất thì tăng bộ đếm Giới hạn và đóng phiên (app chủ động đóng để bù slot).
  attachCompleteTextWatcher(session, session.mainPage, options.completeText, () => {
    session.closingDueToNoLead = true;
    return session.browser?.close?.();
  });
  if (!reconnect && options.scriptSteps?.length) {
    void runScript(session.mainPage, options.scriptSteps, session.currentRecord || {}, {
      session, captchaApiKey: options.captchaApiKey, scriptDir: options.scriptPath ? dirname(options.scriptPath) : '',
      logger: entry => session.addBrowserLog?.(entry)
    }).catch(() => session.addBrowserLog?.({ type: 'script_error', detail: 'Script GoLogin thất bại.' }));
  }
}
