import { isSessionWorkingOnOffer } from './is-session-working-on-offer.mjs';
import { isFinancialhelpThankyouUrl } from './is-financialhelp-thankyou-url.mjs';
import { detectOfferContentInPage } from './detect-offer-content-in-page.mjs';
import { readThrottledPageHealth } from '../page-health/read-throttled-page-health.mjs';
import { readEvidenceWithTimeout } from '../../logging/recorder/read-evidence-with-timeout.mjs';
import { hasPendingOfferwallOpenings } from '../../autofill/reserve-offerwall-tab-slot.mjs';
import { OFFERWALL_CARD_SELECTOR } from '../../autofill/state/offerwall-card-selector.mjs';

const completionStates = new WeakMap();

/**
 * Xác minh mọi tab đã hết form/câu hỏi/offer chưa mở trước khi cho đóng tại trang thankyou chỉ định.
 * Chờ danh sách tab ổn định ba giây; renderer lỗi, AI chạy hoặc popup đang mở đều giữ phiên.
 * @param {object} session Phiên cần xét, kể cả IP đã có lead.
 * @return {Promise<boolean>} True chỉ khi chắc chắn không còn offer đang làm hoặc đang tải.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function canCompleteFinancialhelpSession(session) {
  if (session.isClosed || session.suppressAutoRefill || isSessionWorkingOnOffer(session) || session.aiAssistRunning || session.aiFormFixing || hasPendingOfferwallOpenings(session.browser)) return false;
  const pages = session.browser.pages().filter(page => !page.isClosed());
  if (!pages.some(page => isFinancialhelpThankyouUrl(page.url()))) return false;
  const urls = pages.map(page => page.url());
  const previous = completionStates.get(session);
  if (!previous || previous.pages.length !== pages.length || pages.some((page, index) => previous.pages[index] !== page || previous.urls[index] !== urls[index])) {
    completionStates.set(session, { pages, urls, since: Date.now() });
    return false;
  }
  if (Date.now() - previous.since < 3000) return false;
  try {
    for (const page of pages) {
      if (page._leadRecoveryInProgress || page._aiAssistRunning || page._aiFormFixing || page._uxMainStatus >= 400 || !/^https?:/.test(page.url())) return false;
      if (await readThrottledPageHealth(page)) return false;
      const frames = typeof page.frames === 'function' ? page.frames() : [page];
      for (const frame of frames) {
        if (frame !== page.mainFrame?.() && typeof frame.frameElement === 'function') {
          const element = await frame.frameElement();
          try {
            const bounds = await element.boundingBox();
            if (!bounds || bounds.width <= 4 || bounds.height <= 4) continue;
          } finally { await element.dispose(); }
        }
        const content = await readEvidenceWithTimeout(frame, 'completion', () => frame.evaluate(detectOfferContentInPage));
        if (!content || content.loading || content.challenge || content.hasForm || content.hasChoices) return false;
        const pending = await readEvidenceWithTimeout(frame, 'completion-cards', () => frame.evaluate(selector => {
          if (document.readyState !== 'complete') return true;
          return Array.from(document.querySelectorAll(selector)).some(card => card.getClientRects().length > 0 && card.getAttribute('data-ux-opened') !== '1' && card.closest('form')?.getAttribute('data-ux-opened') !== '1' && card.getAttribute('data-ux-soi-done') !== '1');
        }, OFFERWALL_CARD_SELECTOR));
        if (pending) return false;
      }
    }
    const current = session.browser.pages().filter(page => !page.isClosed());
    return !session.isClosed && !session.suppressAutoRefill && !session.aiAssistRunning && !session.aiFormFixing && !hasPendingOfferwallOpenings(session.browser)
      && current.length === pages.length && current.every((page, index) => page === pages[index] && page.url() === urls[index]);
  } catch { return false; }
}
