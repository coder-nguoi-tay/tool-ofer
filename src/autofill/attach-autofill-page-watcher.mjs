import { shouldPauseForLead } from './should-pause-for-lead.mjs';
import { recoverEmptyProgress } from './late-progress/recover-empty-progress.mjs';
import { inspectAutofillChallenge } from './watchdog/inspect-autofill-challenge.mjs';
import { getAutofillScanDelay } from './watchdog/get-autofill-scan-delay.mjs';
import { repairVisibleFieldsFromRecord } from './watchdog/repair-visible-fields-from-record.mjs';
import { readVisiblePageState } from '../ai-assist/visible-state/read-visible-page-state.mjs';
import { configurePageMousePolicy } from './interaction/configure-page-mouse-policy.mjs';
import { inspectAiStateGate } from '../ai-assist/retry/ai-state-gate.mjs';
import { protectConfirmedLeadSession } from '../leads/actions/protect-confirmed-lead-session.mjs';
import { inspectAndFixFormWithAi } from '../../ai-assist.mjs';

/**
 * Theo dõi điều hướng, lên lịch quét và kiểm tra lead cho một tab.
 * @param {object} page Tab cần xử lý.
 * @param {object} context Dữ liệu phiên và callback điều phối được giữ bởi attachAutofill.
 * @return {void} Hoàn tất thao tác trên tab.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function attachAutofillPageWatcher(page, {
  trackedPages,
  options,
  session,
  fillVisibleForms,
  record,
  checkLeadAfterEmailOnPage,
  isSpamAdUrl,
  watchPage
}) {
  configurePageMousePolicy(page, session);
  if (trackedPages.has(page)) return;
  trackedPages.add(page);
  let filling = false;
  let nextScanAt = 0;
  let scanDelayMs = 500;
  let noProgressRounds = 0;
  let libraryPageUrl = '';
  let firstLibraryPassAt = 0;
  /**
   * Chạy một lượt autofill có khóa chống trùng và kích hoạt watchdog khi không có tiến triển.
   *
   * @param {boolean} force Bỏ thời gian chờ khi có sự kiện trang hoặc yêu cầu thử lại.
   * @return {Promise<void>} Hoàn tất lượt quét hoặc chuyển lỗi sang log.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-12
   */
  // Khóa `filling` phải bật ngay khi kiểm tra, trước mọi `await`: trước đây bật sau lệnh kiểm tra Cloudflare
  // (tối đa 4s), nên timer 250ms / load / triggerAutofillScan chen vào được và chạy nhiều lượt điền song song —
  // hai lần keyboard.type cùng lúc trộn ký tự vào một ô (vd "addoanr1sh4d3@ognm1a4i3@l.gmcaoiml").
  const scan = async (force = false) => {
    if (force !== true && Date.now() < nextScanAt) return;
    if (filling || page._leadRecoveryInProgress || page.isClosed() || page._aiFormFixing || page._aiAssistRunning) return;
    filling = true;
    try {
      await scanOnce();
    } finally {
      filling = false;
      nextScanAt = Date.now() + scanDelayMs;
    }
  };
  /**
   * Quét thư viện trước, theo dõi tiến triển và chuyển AI khi có việc thật sự chưa hoàn tất.
   * @return {Promise<void>} Hoàn tất lượt quét độc lập của tab.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-12
   */
  const scanOnce = async () => {
    protectConfirmedLeadSession(session);
    const u = typeof page.url === 'function' ? page.url() : '';
    if (!u || u.startsWith('chrome-error:') || u.startsWith('about:') || u.startsWith('chrome:') || /toffers\.top\/error\.php/i.test(u) || /error\.php\?.*error=.*ip_/i.test(u) || /clicked_offer_/i.test(u)) {
      return;
    }
    // BẢO VỆ TRÁNH KẸT >20s: trang Cloudflare "Just a moment..." (challenge) không có form nào
    // và lệnh evaluate trên nó có thể treo vô hạn — kiểm tra nhanh (race 4s), nếu là/trang treo thì bỏ qua tab này.
    try {
      let challengeTimer;
      const cfInfo = await Promise.race([page.evaluate(inspectAutofillChallenge), new Promise(resolve => { challengeTimer = setTimeout(() => resolve('timeout'), 4000); challengeTimer.unref?.(); })]).finally(() => clearTimeout(challengeTimer));
      const isCfBlocked = cfInfo === 'timeout' || cfInfo && cfInfo.cf;
      if (isCfBlocked) {
        scanDelayMs = 5000;
        const nowCf = Date.now();
        if (!page._uxCfLoggedAt || nowCf - page._uxCfLoggedAt > 60000) {
          page._uxCfLoggedAt = nowCf;
          const detail = cfInfo === 'timeout'
            ? 'Renderer không phản hồi khi đọc giao diện; giữ tab, giãn lượt kiểm tra và không để AI đoán control.'
            : 'Trang đang hiển thị challenge Cloudflare, chưa có form thao tác được; chờ challenge hoàn tất.';
          console.warn(`[Autofill] ${detail}`);
          options.onLog?.({
            type: cfInfo === 'timeout' ? 'autofill_renderer_unresponsive' : 'cloudflare_challenge_detected',
            detail
          });
        }
        return;
      }
    } catch {
      // Trang có thể vừa điều hướng — cho phép lượt quét sau chạy tiếp.
    }
    if (libraryPageUrl !== u) {
      libraryPageUrl = u;
      firstLibraryPassAt = Date.now();
      noProgressRounds = 0;
      page._aiFormRepairRetry = null;
      page._lastAutofillUnresolvedField = null;
    }
    const fieldsBefore = (session.autofillFields ?? 0) + (session.autofillActions ?? 0);
    // Một lượt quét bình thường xong trong vài giây; quá 20s là đang kẹt ở một lệnh không trả về, ghi lại chỗ kẹt.
    const stuckTimer = setTimeout(() => {
      if ((session.autofillFields ?? 0) + (session.autofillActions ?? 0) > fieldsBefore) return;
      const detail = `Lượt tự điền chạy quá 20s, đang kẹt ở: ${session.autofillStep || 'không rõ'}`;
      console.warn(`[Autofill] ${detail}`);
      options.onLog?.({
        type: 'autofill_stuck',
        detail
      }, page);
    }, 20000);
    stuckTimer.unref?.();
    try {
      await fillVisibleForms(page);
    } catch {
      // Trang có thể điều hướng hoặc đóng giữa hai lần quét.
    } finally {
      clearTimeout(stuckTimer);
    }
    const filled = (session.autofillFields ?? 0) + (session.autofillActions ?? 0) - fieldsBefore;
    if (filled > 0) {
      scanDelayMs = 500;
      noProgressRounds = 0;
      // Điền được trường hoặc submit, quét tiếp ngay tức thì (80ms) để màn hình chạy liên tục
      setTimeout(() => {
        void scan(true);
      }, 80);
    } else {
      // Dùng chung nhận diện visible/iframe với AI, không coi iframe trắng là form bị kẹt.
      if (await recoverEmptyProgress(page, session, options)) { scanDelayMs = 5000; return; }
      const visibleState = await readVisiblePageState(page);
      const hasInteractable = visibleState.available ? visibleState.hasWork : true;
      if (shouldPauseForLead(session, options)) {
        // Đang đợi kiểm tra lead màn 5, không tính là bị kẹt để tránh gọi AI nhầm
        noProgressRounds = 0;
        scanDelayMs = 1500;
        return;
      }
      if (hasInteractable) {
        noProgressRounds += 1;
      } else {
        // Trang chưa có form hoặc đã hoàn tất, reset bộ đếm
        noProgressRounds = 0;
      }

      scanDelayMs = getAutofillScanDelay(noProgressRounds, hasInteractable);

      // Gọi AI Assist khi thực sự kẹt sau nhiều vòng liên tục không có tiến triển
      const leadPriority = protectConfirmedLeadSession(session);
      const stuckThreshold = options.stuckThreshold ?? (leadPriority ? 1 : 3);
      const libraryFirstPassDelayMs = options.libraryFirstPassDelayMs ?? (leadPriority ? 1500 : 5_000);
      const libraryFirstPassFinished = Date.now() - firstLibraryPassAt >= libraryFirstPassDelayMs;
      if (noProgressRounds >= stuckThreshold && libraryFirstPassFinished && !page._aiAssistRunning && !page._aiFormFixing && !page.isClosed()) {
        // Giữ callback onStuck cho tương thích ngược: nơi gọi có thể theo dõi trạng thái kẹt.
        if (['manual','skip','consent_only'].includes(session.offerMode)) return;
        const aiState = visibleState;
        const tabRecord = page._assignedRecord || session.currentRecord || record;
        const localRepairs = await repairVisibleFieldsFromRecord(page, tabRecord, session, aiState, options);
        if (localRepairs > 0) {
          noProgressRounds = 0;
          scanDelayMs = 500;
          setTimeout(() => { void scan(true); }, 80);
          return;
        }
        const firstLeadRetry = leadPriority && !page._aiLeadPriorityActivated;
        if (leadPriority) page._aiLeadPriorityActivated = true;
        const aiDecision = inspectAiStateGate(page, aiState, firstLeadRetry);
        if (!aiDecision.allowed) {
          if (aiDecision.shouldLog) options.onLog?.({ type: 'ai_waiting_state', detail: `Chờ giao diện: ${aiDecision.detail}.` }, page);
          return;
        }
        options.onStuck?.(page);
        if (page._lastAutofillStallSignature !== aiState.signature) {
          page._lastAutofillStallSignature = aiState.signature;
          options.onLog?.({ type: 'autofill_library_stalled', detail: 'Form chưa có tiến triển sau lượt thư viện; thử AI chẩn đoán và giãn các lượt quét lặp.' }, page);
        }
        if (!page._aiAssistRunning && !page._aiFormFixing) {
          void inspectAndFixFormWithAi(page, tabRecord, session, options).then(result => {
            if (!['disabled', 'missing_record', 'retry_limit', 'unverified'].includes(result.status)) return;
            const waitKey = `${aiState.signature}:${result.status}`;
            if (page._lastAutofillWaitKey === waitKey) return;
            page._lastAutofillWaitKey = waitKey;
            const reasons = { disabled: 'AI đang tắt trong cấu hình', missing_record: 'Record thiếu dữ liệu để sửa form', retry_limit: 'Đã hết lượt sửa của trạng thái hiện tại', unverified: 'Website chưa xác nhận kết quả sửa' };
            options.onLog?.({ type: 'autofill_waiting', detail: `${reasons[result.status]}; giữ tab và chờ dữ liệu, thay đổi giao diện hoặc yêu cầu thử lại.` }, page);
          });
        }
      }
    }
  };
  if (!session._pageScans) session._pageScans = new Set();
  session._pageScans.add(scan);
  session.triggerAutofillScan = () => {
    for (const s of session._pageScans || []) {
      try {
        void s(true);
      } catch {}
    }
  };
  page.triggerAutofillScan = () => {
    void scan(true);
  };
  const timer = setInterval(() => {
    void scan();
  }, 500);
  timer.unref?.();
  if (!session._autofillTimers) session._autofillTimers = new Set();
  session._autofillTimers.add(timer);
  session._autofillTimer = timer;
  // Check lead sau màn email chạy độc lập với lượt quét (không bị AI / lượt kẹt chặn).
  const leadTimer = setInterval(() => {
    void checkLeadAfterEmailOnPage(page);
  }, 1000);
  leadTimer.unref?.();
  session._autofillTimers.add(leadTimer);
  if (typeof page.on === 'function') {
    page.on('framenavigated', navFrame => {
      if (typeof page.mainFrame !== 'function' || navFrame === page.mainFrame()) void checkLeadAfterEmailOnPage(page);
    });
    page.on('domcontentloaded', () => { void scan(true); });
    page.on('load', () => { void scan(true); });
    page.on('framenavigated', navFrame => {
      try {
        const u = typeof page.url === 'function' ? page.url() : '';
        const isMain = !navFrame || typeof page.mainFrame === 'function' && navFrame === page.mainFrame();
        if (isMain && u && !u.startsWith('about:') && !u.startsWith('chrome:')) {
          const cleanU = u.split('#')[0];
          if (session.lastTrackedNavUrl && session.lastTrackedNavUrl.split('#')[0] !== cleanU) {
            session.lastTrackedNavUrl = u;
            session.pageJumps = (session.pageJumps || 0) + 1;
            session.screenReached = Math.max(session.screenReached || 1, (session.completedScreens || 0) + 1);
            options.onPageJump?.(session, session.pageJumps, u);
          } else if (!session.lastTrackedNavUrl) {
            session.lastTrackedNavUrl = u;
          }
        }
      } catch {}
      void scan(true);
    });
    page.on('frameattached', () => { void scan(true); });
    page.on('popup', popup => {
      if (protectConfirmedLeadSession(session)) {
        watchPage(popup);
        return;
      }
      const pu = typeof popup?.url === 'function' ? popup.url() : '';
      if (isSpamAdUrl(pu) || /thank[-_]?you(\.php|\.html|\/|\?|$)|thanks(\.php|\.html|\/|\?|$)/i.test(pu)) {
        console.log(`[Autofill] Phát hiện popup rác hoặc trang hoàn tất thankyou (${pu}), đóng ngay lập tức.`);
        options.onLog?.({
          type: 'popup_closed',
          detail: `Đã đóng popup hoàn tất/rác: ${pu}`
        });
        popup.close?.().catch(() => {});
        return;
      }
      watchPage(popup);
    });
    page.on('close', () => {
      clearInterval(timer);
      clearInterval(leadTimer);
      session._autofillTimers?.delete(timer);
      session._autofillTimers?.delete(leadTimer);
      session._pageScans?.delete(scan);
    });
  }

  // Tự động xử lý dialog (alert, confirm, prompt) để tránh làm treo trình duyệt
  if (typeof page.on === 'function') {
    page.on('dialog', async dialog => {
      try {
        const msg = dialog.message()?.slice(0, 80) || '';
        console.log(`[Playwright] Tự động xác nhận dialog (${dialog.type()}): "${msg}"`);
        options.onLog?.({
          type: 'dialog_handled',
          detail: `Đã tự động xác nhận dialog ${dialog.type()}: "${msg}"`
        });
        await dialog.accept().catch(() => {});
      } catch {}
    });

    // Lắng nghe crash để ghi nhận log chẩn đoán
    page.on('crash', () => {
      console.warn('[Playwright] Cảnh báo: Trang bị crash (OOM hoặc mất kết nối proxy)');
      options.onLog?.({
        type: 'page_crash',
        detail: 'Trang bị crash đột ngột (OOM hoặc mất kết nối proxy).'
      });
    });
  }
  void scan();
}
