import { activeBrowsers } from '../sessions.mjs';
import { releaseProxyLock } from '../../proxy/actions/release-proxy-lock.mjs';
import { reservedGoLoginProfileIds } from '../../gologin-profile/profile-reservations.mjs';
import { requestManagedProfileStop } from '../actions/request-managed-profile-stop.mjs';
import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { queueAutomaticRefill } from '../../refill/actions/queue-automatic-refill.mjs';
import { screencastSessions } from '../../runtime/constants/screencast-sessions.mjs';
import { releaseScreencast } from '../screencast.mjs';
import { chromium } from 'playwright';

/**
 * Chỉ dọn khi SDK process đã thoát hoặc có lệnh đóng; mất CDP giữ browser và thử nối lại ba lần.
 * @param {object} session Phiên GoLogin đã có logger và process SDK.
 * @param {number} delayStop Giãn thời gian bù slot khi browser thực sự kết thúc.
 * @param {Function} resume Gắn runtime vào kết nối được khôi phục.
 * @return {void} Gắn observer một lần và cho phép bind context mới sau reconnect.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
export function attachGoLoginSessionLifecycle(session, delayStop = 0, resume = async () => {}) {
  let finished = false, reconnecting = false;
  let finishPromise;
  const bound = new WeakSet();
  const child = session._gologinProcess;
  session.isGoLoginProcessAlive = () => Boolean(child?.pid && child.exitCode === null && child.signalCode === null);
  /**
   * Dọn tài nguyên đúng một lần sau đóng thật hoặc lệnh đóng chủ động.
   * @return {Promise<void>} Ghi kết thúc, nhả khóa và bù đúng chính sách.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-16
   */
  function finish() {
    if (!finishPromise) {
      finished = true;
      finishPromise = Promise.resolve().then(async () => {
        session.isClosed = true;
        activeBrowsers.delete(session);
        await requestManagedProfileStop(session);
        if (!session.isGoLoginProcessAlive()) {
          releaseProxyLock(session.proxy, session.exitIp);
          session.finishRecording?.();
        } else session.addBrowserLog?.({ type: 'gologin_profile_stop_failed', detail: 'Orbita chưa dừng; giữ khóa IP/proxy và nhật ký mở.' });
        if (session._gologinProfileStopped) reservedGoLoginProfileIds.delete(session.profileId);
        await session._cdpBrowser?.close().catch(() => {});
        await releaseViewer();
        if (session._gologinProfileStopped && !session.suppressAutoRefill && autoRefill.enabled && !autoRefill.stopRequested) queueAutomaticRefill(2000 + delayStop * 1000);
      });
    }
    return finishPromise;
  }
  session.closeGoLoginSession = finish;
  /**
   * Nhả stream của kết nối cũ để Screen View tự đăng ký lại trên context được phục hồi.
   * @return {Promise<void>} Stream đã dừng mà không tác động tiến trình Orbita.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-14
   */
  async function releaseViewer() {
    const screen = screencastSessions.get(session.slot);
    if (!screen) return;
    screen.cleaned = true;
    await releaseScreencast(screen).catch(() => {});
    try { screen.sseResponse?.end(); } catch {}
    screencastSessions.delete(session.slot);
  }
  /**
   * Kiểm tra nguyên nhân trước cleanup, không coi disconnect là yêu cầu kill SDK.
   * @return {Promise<void>} Khôi phục kết nối hoặc giữ browser mở và báo chờ xử lý.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-14
   */
  async function handleConnectionLoss() {
    if (finished) return;
    if (!session.isGoLoginProcessAlive() || session._gologinStopRequested || session.isClosed || session.suppressAutoRefill || session._manualBrowserClosePrepared || session.closingDueToNoLead || session.closingDueToTrafficBlocked) {
      await finish(); return;
    }
    if (reconnecting) return;
    reconnecting = true;
    session.connectionStatus = 'disconnected';
    session._resumeRecords ||= new Map();
    session.browser.pages().forEach(page => { if (page._assignedRecord) session._resumeRecords.set(page.url(), page._assignedRecord); });
    await releaseViewer();
    session.addBrowserLog?.({ type: 'gologin_cdp_disconnected', detail: 'Mất CDP nhưng tiến trình Orbita còn sống; giữ browser/IP/lead và nối lại.' });
    for (const delay of [1000, 3000, 5000]) {
      await new Promise(resolve => setTimeout(resolve, delay));
      if (finished || !session.isGoLoginProcessAlive()) break;
      if (session._gologinStopRequested || session.isClosed || session.suppressAutoRefill) break;
      let browser;
      try {
        browser = await chromium.connectOverCDP(session.browserWebSocketUrl, { timeout: 5000 });
        if (finished || session._gologinStopRequested || session.isClosed || !session.isGoLoginProcessAlive()) {
          await browser.close().catch(() => {}); break;
        }
        const context = browser.contexts()[0];
        if (!context) throw new Error('Không có context Orbita.');
        await resume({ browser, context });
        bindConnection();
        session.connectionStatus = 'connected';
        session.addBrowserLog?.({ type: 'gologin_connection_restored', detail: 'Đã nối lại CDP vào Orbita cũ, giữ IP/lead và tiếp tục autofill.' });
        reconnecting = false;
        return;
      } catch { await browser?.close().catch(() => {}); }
    }
    reconnecting = false;
    if (!finished) session.addBrowserLog?.({ type: 'gologin_reconnect_failed', detail: 'Chưa nối lại được CDP; giữ Orbita và khóa IP, không tự tắt hoặc bù phiên trùng.' });
  }
  /**
   * Theo dõi đúng context/kết nối hiện tại sau lần nối lại.
   * @return {void} Gắn observer một lần cho mỗi context.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-14
   */
  function bindConnection() {
    if (bound.has(session.browser)) return;
    bound.add(session.browser);
    session.browser.on('close', () => { void handleConnectionLoss(); });
    session._cdpBrowser?.on?.('disconnected', () => { void handleConnectionLoss(); });
  }
  child?.once?.('exit', (code, signal) => {
    session.addBrowserLog?.({ type: 'gologin_process_exited', detail: `Tiến trình Orbita đã thoát (code=${code ?? 'null'}, signal=${signal || 'none'}).` });
    void finish();
  });
  bindConnection();
}
