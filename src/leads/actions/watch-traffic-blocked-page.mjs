import { completeFinancialhelpSession } from './complete-financialhelp-session.mjs';
import { isFinancialhelpThankyouUrl } from './is-financialhelp-thankyou-url.mjs';
import { recoverConfirmedLeadErrorPage } from './recover-confirmed-lead-error-page.mjs';
import { protectConfirmedLeadSession } from './protect-confirmed-lead-session.mjs';
import { activeBrowsers } from '../../browser/sessions.mjs';
import { applicationState } from '../../runtime/application-state.mjs';
import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { browserSessionLogs } from '../../logging/browser-logs.mjs';
import { executeFile } from '../../runtime/constants/execute-file.mjs';
import { hasUnfinishedOfferWork } from './has-unfinished-offer-work.mjs';
import { readThrottledPageHealth } from '../page-health/read-throttled-page-health.mjs';
import { isThankYouUrl } from './is-thank-you-url.mjs';
import { closeHistoryStatus } from '../../proxy/actions/is-exit-ip-consumed.mjs';
import { isToffersDuplicateOfferUrl } from './is-toffers-duplicate-offer-url.mjs';
import { persistProxyUsageHistory } from '../../proxy/actions/persist-proxy-usage-history.mjs';
import { queueAutomaticRefill } from '../../refill/actions/queue-automatic-refill.mjs';
import { queueSaveBrowserLogs } from '../../logging/browser-logs.mjs';
import { readProxyUsageHistory } from '../../proxy/actions/read-proxy-usage-history.mjs';
import { requestManagedProfileStop } from '../../browser/actions/request-managed-profile-stop.mjs';
import { warnIdleOfferSession } from './warn-idle-offer-session.mjs';
import { recordProxyOutcome, sessionLabel } from './record-proxy-outcome.mjs';
import { getEmptyOfferPageReason } from './get-empty-offer-page-reason.mjs';
import { isSessionWorkingOnOffer } from './is-session-working-on-offer.mjs';
import { readSubOfferCloseReason } from './get-sub-offer-close-reason.mjs';

/**
 * Theo dõi lỗi/tự bù phiên chưa có lead; chỉ đóng thêm trang trắng/một dòng sau thời gian chờ.
 * Không phân loại non-offer nói chung. Phiên có lead quay lại trang trước khi lỗi và tiếp tục form.
 *
 * @param {object} session Phiên Chrome đã mở thành công.
 * @return {void} Gắn lịch kiểm tra vào các tab của phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function watchTrafficBlockedPage(session) {
  if (!session || session.trafficWatcherAttached) return;
  session.trafficWatcherAttached = true;
  let checking = false;
  let blocked = false;
  const redirectTracker = new WeakMap();
  const emptyPageTrackers = new WeakMap();
  const idleTracker = { startedAt: Date.now() };

  /**
   * Đóng an toàn một phiên trình duyệt bị lỗi hoặc hoàn tất.
   * Đảm bảo session được xoá khỏi activeBrowsers trước khi gọi bù slot.
   * @param {object} options Tab lỗi hoặc cờ hoàn tất FinancialHelpFinder đã được kiểm tra nội bộ.
   * @return {Promise<void>} Đóng phiên/bù theo trạng thái Start/Stop hiện tại.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-12
   */
  const closeSessionAndRefill = async (options = {}) => {
    if (session.isClosed || protectConfirmedLeadSession(session) && !options.completedFinancialFlow) return;
    blocked = true;
    clearInterval(timer);
    session.closingDueToTrafficBlocked = !options.completedFinancialFlow;
    session.isClosed = true;
    activeBrowsers.delete(session);

    if (autoRefill.stopRequested || !autoRefill.enabled) {
      session.suppressAutoRefill = true;
      if (options.page) await options.page.close().catch(() => {});
      await session.browser?.close?.().catch(() => {});
      if (session._cdpBrowser) await session._cdpBrowser?.close?.().catch(() => {});
      if (session.isAdsPower) void requestManagedProfileStop(session);
      if (session.proxyKey) {
        await executeFile('pkill', ['-9', '-f', `user-data-dir.*${session.proxyKey}`]).catch(() => {});
      }
      return;
    }

    session.suppressAutoRefill = false;
    applicationState.chromeBuildRotationCounter += 1;
    if (options.page) await options.page.close().catch(() => {});
    await session.browser?.close?.().catch(() => {});
    if (session._cdpBrowser) await session._cdpBrowser?.close?.().catch(() => {});
    if (session.isAdsPower) void requestManagedProfileStop(session);
    if (session.proxyKey) {
      await executeFile('pkill', ['-9', '-f', `user-data-dir.*${session.proxyKey}`]).catch(() => {});
    }

    if (!autoRefill.stopRequested && autoRefill.enabled) {
      queueAutomaticRefill();
    }
  };

  /**
   * Phát hiện lỗi duplicate; IP có lead phục hồi bằng Back, IP chưa có lead dùng luồng đóng/bù.
   * @param {object} p Tab vừa điều hướng.
   * @return {Promise<void>} Hoàn tất kiểm tra hoặc yêu cầu phục hồi.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-12
   */
  const checkInstantToffersDup = async p => {
    try {
      if (blocked || checking || !p || (typeof p.isClosed === 'function' && p.isClosed())) return;
      if (protectConfirmedLeadSession(session)) { await recoverConfirmedLeadErrorPage(session, p); return; }
      const u = typeof p.url === 'function' ? p.url() : '';
      if (isToffersDuplicateOfferUrl(u)) {
        const slotNum = session.slot ?? (session.tileIndex ?? 0) + 1;
        const label = sessionLabel(session);
        const dupReason = 'IP đã click offer trước đó (Toffers Duplicate IP)';
        console.log(`[ToffersDup] ${label} [Slot ${slotNum}|IP: ${session.exitIp || 'chưa rõ'}]: Phát hiện URL lỗi duplicate offer (${u}). Tự động đóng trình duyệt và bù slot mới ngay lập tức.`);

        if (await recordProxyOutcome(session, 'duplicate_ip', dupReason)) return;

        autoRefill.message = `${label} (IP ${session.exitIp ?? 'chưa rõ'}) đã click offer trước đó; đã đóng cửa sổ và đang tự động mở sock khác thay thế…`;
        // Qua addBrowserLog: có id/sequence, được gộp và theo chính sách chụp bằng chứng của recorder.
        session.addBrowserLog?.({
          offer: session.offerNumber ?? session.streamRole ?? 1,
          type: 'toffers_duplicate_ip',
          detail: `${label} (IP: ${session.exitIp ?? 'chưa rõ'}) bị ${dupReason} [${u}]. Đóng cửa sổ và đổi sock khác.`
        });
        session.updateBadge?.(`⚠️ <strong>IP trùng offer</strong> Đang đổi sock…`);
        await closeSessionAndRefill({ page: p });
      }
    } catch {}
  };

  /**
   * Dọn trang hoàn tất thankyou.php và chuyển proxy mới để chạy liên tục.
   */
  const handleThankYouClose = async (p, u) => {
    try {
      if (protectConfirmedLeadSession(session) || p._uxThankYouHandled) return;
      if (await hasUnfinishedOfferWork(p)) return;
      const slotNum = session.slot ?? (session.tileIndex ?? 0) + 1;
      const label = sessionLabel(session);
      const allPages = typeof session.browser?.pages === 'function' ? await session.browser.pages() : [];
      const otherTabs = allPages.filter(other => other !== p && !other.isClosed?.());
      if (p === session.mainPage && otherTabs.length > 0) return;
      p._uxThankYouHandled = true;
      // Tab đầu chỉ được người dùng tắt tay: tab đầu tới thankyou thì hoàn tất cả phiên (nhánh dưới), không đóng riêng.
      if (otherTabs.length > 0 && p !== session.mainPage) {
        console.log(`[ThankYou] ${label}: Tab hoàn tất ${u}, tự động đóng tab và quay về tab chính.`);
        session.addBrowserLog?.({
          type: 'thankyou_tab_closed',
          detail: `Tab hoàn tất ${u}. Đóng tab, giữ các tab còn lại.`
        });
        p._uxClosedByApp = 'tab hoàn tất thankyou.php';
        if (protectConfirmedLeadSession(session)) return;
        await p.close().catch(() => {});
        const remaining = (session.browser?.pages ? session.browser.pages() : []).filter(rem => !rem.isClosed());
        if (remaining.length > 0) await (session.mainPage?.isClosed?.() ? remaining[0] : session.mainPage).bringToFront().catch(() => {});
        return;
      }

      // Nếu là tab duy nhất hoặc toàn bộ tab đã hoàn thành: đóng browser và hoàn thành phiên
      console.log(`[ThankYou] ${label} [Slot ${slotNum}|IP: ${session.exitIp || 'chưa rõ'}]: Phát hiện trang hoàn tất thankyou.php (${u}). Tự động đóng trình duyệt và chuyển proxy mới.`);
      if (await recordProxyOutcome(session, 'completed', 'Hoàn tất trang thankyou.php')) return;
      // Qua addBrowserLog: có id/sequence, được gộp và theo chính sách chụp bằng chứng của recorder.
      session.addBrowserLog?.({
        offer: session.offerNumber ?? session.streamRole ?? 1,
        type: 'thankyou_completed',
        detail: `${label} (IP: ${session.exitIp ?? 'chưa rõ'}) đã hoàn tất đến trang thankyou.php [${u}]. Tự động đóng trình duyệt.`
      });
      session.updateBadge?.(`🎉 <strong>Đã hoàn tất</strong> thankyou.php`);
      await closeSessionAndRefill({ page: p });
    } catch (err) {
      console.error(`[ThankYou] Lỗi khi xử lý đóng trang thankyou: ${err.message}`);
    }
  };

  /**
   * Kiểm tra trang hoàn tất sau điều hướng, chỉ đóng FinancialHelpFinder khi hết tab offer.
   * @param {object} p Tab vừa điều hướng.
   * @return {Promise<void>} Hoàn tất kiểm tra hoặc tiếp tục giữ các offer đang chạy.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-12
   */
  const checkInstantThankYou = async p => {
    try {
      if (blocked || checking || !p || (typeof p.isClosed === 'function' && p.isClosed())) return;
      const u = typeof p.url === 'function' ? p.url() : '';
      if (isFinancialhelpThankyouUrl(u)) { await completeFinancialhelpSession(session, closeSessionAndRefill); return; }
      if (protectConfirmedLeadSession(session)) return;
      if (isThankYouUrl(u)) {
        await handleThankYouClose(p, u);
      }
    } catch {}
  };

  const bindPageInstantCheck = p => {
    // Gắn ngay khi tab xuất hiện: response điều hướng đầu tiên của popup thường tới trước nhịp kiểm tra 1s.
    if (p && !p._uxStatusListenerBound) {
      p._uxStatusListenerBound = true;
      p.on?.('response', res => {
        if (res.request().isNavigationRequest() && res.frame() === p.mainFrame()) p._uxMainStatus = res.status();
      });
    }
    if (!p || p._toffersDupCheckBound) return;
    p._toffersDupCheckBound = true;
    p.on?.('framenavigated', () => {
      p._uxHealthRevision = (p._uxHealthRevision ?? 0) + 1;
      void checkInstantToffersDup(p);
      void checkInstantThankYou(p);
    });
    void checkInstantToffersDup(p);
    void checkInstantThankYou(p);
  };

  try {
    const existing = typeof session.browser?.pages === 'function' ? session.browser.pages() : [];
    existing.forEach(bindPageInstantCheck);
    session.browser?.on?.('page', bindPageInstantCheck);
  } catch {}

  /**
   * Đóng các tab offer phụ (không phải tab đầu/tab gốc) đang ở trang hết offer / chờ xác minh email / lifepointspanel,
   * hoặc sau 30s vẫn không có form/câu hỏi nào để làm (ưu tiên giữ tab có form và đáp án).
   * Chỉ đóng tab, không đóng trình duyệt; tab đầu không bao giờ bị đóng ở đây.
   * @param {object} session Phiên trình duyệt.
   * @param {object[]} pages Các tab đang mở.
   * @return {Promise<void>}
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-13
   */
  const closeFinishedSubOfferTabs = async (session, pages) => {
    for (const page of pages) {
      if (page === session.mainPage || page._uxOriginTab || page.isClosed?.()) continue;
      // Tab phụ là tab cuối: không đóng ở đây (đóng = đóng cả trình duyệt), để nhánh đóng phiên + bù slot bên dưới xử lý.
      if (!pages.some(other => other !== page && !other.isClosed?.())) continue;
      let tracker = emptyPageTrackers.get(page);
      if (!tracker) { tracker = { since: Date.now() }; emptyPageTrackers.set(page, tracker); }
      const subOfferReason = await readSubOfferCloseReason(page) || await getEmptyOfferPageReason(page, tracker, { subTab: true });
      if (!subOfferReason || page.isClosed?.()) continue;
      const currentUrl = typeof page.url === 'function' ? page.url() : '';
      console.log(`[SubOffer] Đóng tab ${currentUrl}: ${subOfferReason}.`);
      session.addBrowserLog?.({ type: 'sub_offer_tab_closed', detail: `Đóng tab offer phụ (${subOfferReason}): ${currentUrl}` });
      page._uxClosedByApp = `offer phụ: ${subOfferReason}`;
      await page.close().catch(() => {});
    }
  };

  const timer = setInterval(() => {
    if (checking || blocked) return;
    checking = true;
    void (async () => {
      try {
        if (!session.browser || (typeof session.browser.isClosed === 'function' && session.browser.isClosed())) {
          clearInterval(timer);
          return;
        }
        const pages = typeof session.browser?.pages === 'function' ? await session.browser.pages() : [];
        // Đóng tab offer phụ TRƯỚC nhánh bảo vệ phiên có lead: offer phụ chỉ mở sau khi có lead, mà nhánh đó
        // return sớm nên trước đây (log 2026-11-13 slot 2) tab lifepointspanel 404 không bao giờ bị đóng.
        await closeFinishedSubOfferTabs(session, pages);
        if (await completeFinancialhelpSession(session, closeSessionAndRefill)) return;
        if (protectConfirmedLeadSession(session)) {
          for (const page of pages) await recoverConfirmedLeadErrorPage(session, page);
          return;
        }

        warnIdleOfferSession(session, idleTracker);

        for (const page of pages) {
          if (typeof page?.isClosed === 'function' && page.isClosed()) continue;

          // Kiểm tra nếu tab đã tới trang thankyou.php (hoàn tất luồng)
          const currentUrl = typeof page.url === 'function' ? page.url() : '';
          if (isFinancialhelpThankyouUrl(currentUrl)) continue;
          if (isThankYouUrl(currentUrl)) {
            await handleThankYouClose(page, currentUrl);
            continue;
          }

          bindPageInstantCheck(page);
          let deadReason = await readThrottledPageHealth(page);
          if (!deadReason && !isSessionWorkingOnOffer(session)) {
            let tracker = emptyPageTrackers.get(page);
            if (!tracker) {
              tracker = { since: Date.now() };
              emptyPageTrackers.set(page, tracker);
            }
            deadReason = await getEmptyOfferPageReason(page, tracker);
          }
          if (protectConfirmedLeadSession(session)) return;

          if (deadReason) {
            const isToffersDup = deadReason.includes('Toffers Duplicate IP') || deadReason.includes('click offer');
            // Tab phụ là tab cuối: đóng cả phiên (bên dưới) để bù slot. Trước đây chỉ đóng tab, rồi
            // closeChromeWhenLastTabCloses hiểu nhầm là người dùng bấm X nên không bù và còn trừ target.
            const hasOtherTabs = pages.some(p => p !== page && !p.isClosed?.());
            if (!isToffersDup && page !== session.mainPage && !page._uxOriginTab && hasOtherTabs) {
              console.log(`[DeadTab] Tab phụ bị ${deadReason} (${page.url()}), đóng tab và quay về tab chính.`);
              session.addBrowserLog?.({
                type: 'traffic_blocked',
                detail: `Tab phụ bị ${deadReason}. Đóng tab, giữ trình duyệt.`
              });
              if (protectConfirmedLeadSession(session)) return;
              page._uxClosedByApp = `tab phụ lỗi: ${deadReason}`;
              await page.close().catch(() => {});
              const remaining = (session.browser?.pages ? session.browser.pages() : []).filter(p => !p.isClosed());
              if (remaining.length > 0) await (session.mainPage?.isClosed?.() ? remaining[0] : session.mainPage).bringToFront().catch(() => {});
              continue;
            }

            // Tab chính hoặc IP đã click offer bị lỗi → đóng cả browser và bù slot mới
            if (await recordProxyOutcome(session, closeHistoryStatus(deadReason, false), deadReason)) return;

            const label = sessionLabel(session);
            autoRefill.message = `${label} (IP ${session.exitIp ?? 'chưa rõ'}) bị ${deadReason}; đã đóng cửa sổ và đang tự động mở sock khác thay thế…`;
            // Qua addBrowserLog: có id/sequence, được gộp và theo chính sách chụp bằng chứng của recorder.
            session.addBrowserLog?.({
              offer: session.offerNumber ?? session.streamRole ?? 1,
              type: 'traffic_blocked',
              detail: `${label} (IP: ${session.exitIp ?? 'chưa rõ'}) bị ${deadReason}. Đóng cửa sổ và đổi sock khác.`
            });
            session.updateBadge?.(`⚠️ <strong>${deadReason}</strong> Đang đổi sock…`);
            await closeSessionAndRefill({ page });
            return;
          }

          // 2. Kiểm tra nếu web đứng ở adtrapper mãi không nhảy tab
          const isAdtrapper = /adtrapper|adswapper/i.test(currentUrl);
          if (isAdtrapper) {
            const isDisabledLanding = /\/disabled(\.html)?(\?|\/|$)/i.test(currentUrl);
            if (isDisabledLanding) {
              const label = sessionLabel(session);
              const disabledReason = 'Landing báo DISABLED (offer từ chối traffic/IP-geo)';
              if (await recordProxyOutcome(session, 'failed', disabledReason)) return;
              autoRefill.message = `${label} (IP ${session.exitIp ?? 'chưa rõ'}) vào landing DISABLED của adswapper; đã đóng cửa sổ và đang tự động mở sock khác thay thế…`;
              console.log(`[Adtrapper] ${label}: ${disabledReason}. Đóng ngay (không reload).`);
              // Qua addBrowserLog: có id/sequence, được gộp và theo chính sách chụp bằng chứng của recorder.
              session.addBrowserLog?.({
                offer: session.offerNumber ?? session.streamRole ?? 1,
                type: 'adtrapper_disabled_close',
                detail: `${label} (IP: ${session.exitIp ?? 'chưa rõ'}) vào landing disabled.html — offer từ chối traffic/IP. Đóng ngay và đổi sock khác.`
              });
              await closeSessionAndRefill({ page });
              return;
            }

            // Kiểm tra xem đã có tab khác nhảy sang trang offer đích chưa
            const hasOtherOfferTab = pages.some(p => {
              if (p === page || (typeof p.isClosed === 'function' && p.isClosed())) return false;
              const otherUrl = typeof p.url === 'function' ? p.url() : '';
              return otherUrl && !otherUrl.startsWith('about:') && !/adtrapper|adswapper|toffers\.top/i.test(otherUrl);
            });
            if (!hasOtherOfferTab) {
              let tracker = redirectTracker.get(page);
              if (!tracker) {
                tracker = {
                  firstSeenAt: Date.now(),
                  reloadCount: 0,
                  lastReloadAt: 0,
                  reloading: false
                };
                redirectTracker.set(page, tracker);
              }
              if (!tracker.reloading) {
                const timeWaiting = Date.now() - (tracker.lastReloadAt || tracker.firstSeenAt);
                if (timeWaiting >= 8000) {
                  const label = sessionLabel(session);
                  if (tracker.reloadCount < 2) {
                    tracker.reloadCount += 1;
                    tracker.reloading = true;
                    tracker.lastReloadAt = Date.now();
                    console.log(`[Adtrapper] ${label}: Đứng ở adtrapper quá 8s chưa nhảy tab. Đang tải lại trang (lần ${tracker.reloadCount}/2)...`);
                    // Qua addBrowserLog: có id/sequence, được gộp và theo chính sách chụp bằng chứng của recorder.
                    session.addBrowserLog?.({
                      offer: session.offerNumber ?? session.streamRole ?? 1,
                      type: 'adtrapper_reload',
                      detail: `Đứng ở adtrapper quá 8s chưa nhảy tab. Đang tải lại trang (lần ${tracker.reloadCount}/2)...`
                    });
                    session.updateBadge?.(`⏳ <strong>Đứng ở adtrapper:</strong> Đang tải lại lần ${tracker.reloadCount}/2…`);
                    try {
                      await page.reload({
                        waitUntil: 'domcontentloaded',
                        timeout: 15000
                      });
                    } catch {} finally {
                      tracker.reloading = false;
                      tracker.lastReloadAt = Date.now();
                    }
                  } else {
                    const reason = 'Kẹt tại adtrapper không chuyển hướng sau 2 lần tải lại';
                    console.log(`[Adtrapper] ${label}: ${reason}. Đang đóng cửa sổ và mở sock khác.`);
                    if (await recordProxyOutcome(session, 'failed', reason)) return;
                    autoRefill.message = `${label} (IP ${session.exitIp ?? 'chưa rõ'}) bị kẹt tại adtrapper; đã đóng cửa sổ và đang tự động mở sock khác thay thế…`;
                    // Qua addBrowserLog: có id/sequence, được gộp và theo chính sách chụp bằng chứng của recorder.
                    session.addBrowserLog?.({
                      offer: session.offerNumber ?? session.streamRole ?? 1,
                      type: 'adtrapper_stuck_close',
                      detail: `${label} (IP: ${session.exitIp ?? 'chưa rõ'}) bị kẹt tại adtrapper không nhảy tab sau 2 lần tải lại. Đóng cửa sổ và đổi sock khác.`
                    });
                    await closeSessionAndRefill({ page });
                    return;
                  }
                }
              }
            }
          } else {
            redirectTracker.delete(page);
          }
        }
      } catch {
        // Tab có thể đóng hoặc chuyển trang trong lúc kiểm tra.
      } finally {
        checking = false;
      }
    })();
  }, 1000);

  timer.unref?.();
  if (typeof session.browser?.on === 'function') {
    session.browser.on('close', () => clearInterval(timer));
    session.browser.on('disconnected', () => clearInterval(timer));
  }
}
