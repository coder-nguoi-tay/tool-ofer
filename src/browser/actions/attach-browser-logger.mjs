import { randomUUID } from 'node:crypto';
import { browserSessionLogs, persistedBrowserLogs, queueSaveBrowserLogs } from '../../logging/browser-logs.mjs';
import { createSnapshotRecorder } from '../../logging/recorder/create-snapshot-recorder.mjs';
import { attachPageDiagnostics } from '../../logging/recorder/attach-page-diagnostics.mjs';
import { createRecentActionBuffer } from '../../logging/recorder/create-recent-action-buffer.mjs';
import { createLogCoalescer } from '../../logging/recorder/create-log-coalescer.mjs';
import { isDetailedRecording, isDiagnosticEvent, shouldCaptureEvent } from '../../logging/recorder/recording-policy.mjs';
import { limitSessionEvents } from '../../logging/recorder/limit-session-events.mjs';

/**
 * Ghi tiến trình, gộp lỗi lặp và giữ ngữ cảnh thao tác gần nhất để chẩn đoán theo phiên/IP.
 * @param {object} context BrowserContext của Chrome hoặc AdsPower.
 * @param {object} session Phiên sở hữu các tab trình duyệt.
 * @return {void} Gắn bộ ghi nhận dùng chung cho bot, Screen View và observer.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function attachBrowserLogger(context, session) {
  const sessionItem = {
    id: randomUUID(), slot: session.slot ?? (session.tileIndex ?? 0) + 1,
    offer: session.offerNumber ?? session.streamRole ?? 1, offerUrl: session.websiteUrl ?? '',
    ip: session.exitIp ?? '?', version: session.chromeVersion ?? 'stable',
    startedAt: new Date().toISOString(), logs: [], feedback: [],
  };
  session.recordingId = sessionItem.id;
  persistedBrowserLogs.unshift(sessionItem);
  browserSessionLogs.set(session, sessionItem.logs);
  const snapshots = createSnapshotRecorder(session);
  const pageIds = new WeakMap();
  let nextPageNumber = 0;
  let nextEventNumber = 0;
  const recentActions = createRecentActionBuffer();
  const coalesce = createLogCoalescer();
  session.recordRecentBrowserAction = recentActions.push;

  /**
   * Ghi mốc nghiệp vụ hoặc tăng bộ đếm sự kiện lặp; chỉ lỗi mới nhận bộ đệm và bằng chứng.
   * @param {object} entry Nội dung hành động hoặc lỗi.
   * @param {object|null} eventPage Tab phát sinh, nếu có.
   * @return {object} Sự kiện đã được gán định danh và lưu vào phiên.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  function addLog(entry, eventPage = null) {
    sessionItem.ip = session.exitIp ?? sessionItem.ip;
    sessionItem.offer = session.offerNumber ?? sessionItem.offer;
    sessionItem.offerUrl = session.websiteUrl ?? sessionItem.offerUrl;
    if (!persistedBrowserLogs.includes(sessionItem)) persistedBrowserLogs.unshift(sessionItem);
    const page = eventPage || (session.mainPage && !session.mainPage.isClosed() ? session.mainPage : context.pages().find(candidate => !candidate.isClosed()));
    if (page && !pageIds.has(page)) pageIds.set(page, ++nextPageNumber);
    const result = coalesce(entry, page, () => ({
      ...entry, id: randomUUID(), sequence: ++nextEventNumber,
      time: new Date().toISOString(), offer: entry.offer ?? sessionItem.offer,
      tabId: page ? pageIds.get(page) : null, pageUrl: page?.url() || '',
      source: entry.source || 'automation', screen: session.currentScreen ?? session.screenReached ?? 1,
      leadStatus: session.leadCheckStatus ?? null,
      autofillStep: session.autofillStep ?? null, offerMode: session.offerMode ?? null,
    }));
    const logItem = result.entry;
    let isNew = result.isNew;
    if (!isNew && !sessionItem.logs.includes(logItem)) {
      logItem.id = randomUUID();
      logItem.sequence = ++nextEventNumber;
      isNew = true;
    }
    if (isNew) {
      if (isDiagnosticEvent(logItem)) logItem.recentActions = recentActions.read(page);
      sessionItem.logs.push(logItem);
      limitSessionEvents(sessionItem);
      if (shouldCaptureEvent(logItem)) snapshots.schedule(page, logItem);
    }
    queueSaveBrowserLogs(isNew && (isDiagnosticEvent(logItem) || logItem.type === 'session_closed') ? 250 : 5000);
    return logItem;
  }
  session.addBrowserLog = session.addLog = addLog;
  session.logs = sessionItem.logs;
  const hookedPages = new WeakSet();

  /**
   * Theo dõi điều hướng chính và lỗi; điều hướng iframe chỉ vào bộ đệm hoặc log debug.
   * @param {object} page Tab cần quan sát.
   * @return {void} Đăng ký listener một lần cho mỗi tab.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  function hookPage(page) {
    if (hookedPages.has(page)) return;
    hookedPages.add(page);
    addLog({ type: 'tab_opened', source: 'browser', detail: 'Mở tab trình duyệt.' }, page);
    attachPageDiagnostics(page, addLog, session);
    page.on('framenavigated', frame => {
      const mainFrame = frame === page.mainFrame();
      recentActions.push(page, { kind: mainFrame ? 'navigate' : 'iframe_navigate', frm: frame.url(), ts: new Date().toISOString() });
      if (mainFrame || isDetailedRecording(session)) addLog({
        type: 'navigate', source: 'browser', url: frame.url(), mainFrame,
        detail: mainFrame ? 'Trang điều hướng hoặc tải lại.' : 'Iframe điều hướng.',
      }, page);
    });
    page.on('load', () => addLog({ type: 'page_loaded', source: 'browser', detail: 'Trang tải xong.' }, page));
    page.on('close', () => addLog({ type: 'tab_closed', source: 'browser', detail: page._uxClosedByApp || 'Tab đã đóng.' }, page));
  }
  context.on('page', hookPage);
  for (const page of context.pages()) hookPage(page);
  context.on('close', () => {
    snapshots.stop();
    sessionItem.endedAt = new Date().toISOString();
    addLog({ type: 'session_closed', source: 'browser', detail: 'Phiên trình duyệt kết thúc.' });
    browserSessionLogs.delete(session);
  });
}
