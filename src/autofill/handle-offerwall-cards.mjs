import { OFFERWALL_CARD_SELECTOR } from './state/offerwall-card-selector.mjs';
import { reserveOfferwallTabSlot } from './reserve-offerwall-tab-slot.mjs';
import { MAX_OFFER_TABS } from '../runtime/constants/max-offer-tabs.mjs';

/**
 * Phát hiện và tự động mở tất cả các view/thẻ trên trang Offerwall cuối cùng.
 * Mỗi offer được bấm/nhảy sang trang riêng; các tab offer con được điền song song
 * bởi vòng quét riêng của từng tab (context.on('page', watchPage)).
 * Có trần số tab con đồng thời (mặc định MAX_OFFER_TABS trừ tab hiện tại): khi hết trần,
 * dừng mở thêm ở vòng quét này — thẻ chưa mở sẽ được thử lại vòng sau khi có tab hoàn tất.
 *
 * @param {object} frame Frame Playwright đang quét.
 * @param {object} [page=null] Page Playwright hiện tại để điều hướng trang gốc khi thẻ chỉ có link.
 * @param {object} [options={}] Tùy chọn: maxConcurrentSubOffers (trần tab offer con đồng thời).
 * @return {Promise<number>} Số lượng thẻ offerwall đã được kích hoạt mở.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
async function handleOfferwallCards(frame, page = null, options = {}) {
  let openedCount = 0;
  const maxConcurrentSubOffers = Math.min(MAX_OFFER_TABS - 1, Math.max(0, Number(options.maxConcurrentSubOffers ?? MAX_OFFER_TABS - 1)));
  try {
    // Trần tab đồng thời được check lại trước MỖI thẻ — đủ trần thì dừng, giữ thẻ
    // chưa đánh dấu data-ux-opened để vòng quét sau (khi có tab hoàn tất nhả slot) mở tiếp.
    const cardsToOpen = await frame.evaluate(cardSelector => {
      const allCards = Array.from(document.querySelectorAll(cardSelector));
      // Chỉ lấy thẻ cấp cao nhất: loại bỏ thẻ lồng trong thẻ khác đã khớp
      // để tránh bấm cùng một offer nhiều lần (click liên tục vào 1 link).
      const topLevel = allCards.filter(card => !allCards.some(other => other !== card && other.contains(card)));
      const unhandled = [];
      topLevel.forEach((card, idx) => {
        if (card.getAttribute('data-ux-opened') === '1') return;
        const form = card.closest('form') || (card.tagName.toLowerCase() === 'form' ? card : null);
        if (form && form.getAttribute('data-ux-opened') === '1') return;

        // Bỏ qua thẻ SOI yes/no của alpha-intent: được handleAlphaIntentSoiCards xử lý
        // theo tỉ lệ Yes/No riêng (bấm .first() ở đây sẽ luôn trúng Yes, sai tỉ lệ).
        const soiCard = card.getAttribute?.('data-object-creative-type') === 'soiyesno' || card.querySelector?.('[data-object-creative-type="soiyesno"]');
        if (soiCard) {
          if (card.getAttribute('data-ux-soi-done') === '1') {
            card.setAttribute('data-ux-opened', '1');
          }
          return;
        }
        const uid = `offerwall_card_${idx}_${Date.now()}`;
        card.setAttribute('data-ux-card-id', uid);
        if (form) form.setAttribute('data-ux-card-id', uid);

        // KHÔNG đánh dấu data-ux-opened ở đây: nếu mở thất bại (nút không bấm được,
        // tab không mở), thẻ sẽ được thử lại ở vòng quét sau thay vì bị bỏ qua vĩnh viễn.
        const btn = card.querySelector('.offerwall-btn, button[type="submit"], button#btnSubmit, a.offerwall-btn, [data-tf-element-role="offer-btn"], ' + 'a[id^="ct-creative-submit-"], button[id^="ct-creative-submit-"], .ct-creative-submit, .ai-submit-button, ' + 'button.question-answer-button, button[id^="answer-"], .eligibility-btn, [data-mock-secondary-offer-action]');
        const destUrl = card.getAttribute('data-destination-url') || form?.getAttribute('data-destination-url') || card.querySelector('a[href]')?.getAttribute('href') || '';
        unhandled.push({
          uid,
          hasBtn: Boolean(btn),
          destUrl
        });
      });
      return unhandled;
    }, OFFERWALL_CARD_SELECTOR).catch(() => []);
    if (!cardsToOpen || !cardsToOpen.length) return 0;
    for (const card of cardsToOpen) {
      let releaseTabSlot;
      try {
        if (!card.hasBtn && (!card.destUrl || !card.destUrl.startsWith('http'))) {
          await frame.evaluate(uid => {
            const el = document.querySelector(`[data-ux-card-id="${uid}"]`);
            if (el) el.setAttribute('data-ux-opened', '1');
          }, card.uid).catch(() => {});
          continue;
        }

        // Chuẩn giữ mỗi thẻ: đủ trần tab đồng thời thì dừng mở thêm (chưa đánh dấu gì,
        // thẻ này sẽ được mở ở vòng quét sau).
        releaseTabSlot = reserveOfferwallTabSlot(page, maxConcurrentSubOffers);
        if (!releaseTabSlot) break;
        const cardLoc = frame.locator(`[data-ux-card-id="${card.uid}"]`).first();
        if ((await cardLoc.count()) <= 0) continue;
        let opened = false;
        const btn = cardLoc.locator('.offerwall-btn, button[type="submit"], button#btnSubmit, a.offerwall-btn, [data-tf-element-role="offer-btn"], ' + 'a[id^="ct-creative-submit-"], button[id^="ct-creative-submit-"], .ct-creative-submit, .ai-submit-button, ' + 'button.question-answer-button, button[id^="answer-"], .eligibility-btn, [data-mock-secondary-offer-action], ' + '.offer-button, .btn-offer, .claim-button, a[class*="offer"], button[class*="offer"]').first();
        if ((await btn.count()) > 0 && (await btn.isVisible().catch(() => false))) {
          opened = await btn.click({
            timeout: 2000,
            force: true
          }).then(() => true).catch(async () => {
            return btn.evaluate(b => {
              b.click();
              const form = b.closest('form');
              if (form) form.submit();
            }).then(() => true).catch(() => false);
          });
        } else if (card.destUrl && card.destUrl.startsWith('http') && page) {
          // Điều hướng trong trang gốc thay vì mở tab mới (hành vi người thật:
          // bấm link là trang chính nhảy đi). Nếu trang gốc đóng thì bỏ qua thẻ.
          try {
            if (typeof page.goto === 'function' && !(typeof page.isClosed === 'function' && page.isClosed())) {
              await page.goto(card.destUrl, {
                timeout: 15000,
                waitUntil: 'domcontentloaded'
              }).catch(() => {});
              opened = true;
            }
          } catch {}
        }
        if (opened) {
          // Đánh dấu đã mở SAU khi mở thành công để tránh retry mở lại offer đã mở.
          // Dùng frame.evaluate với uid thay vì cardLoc.evaluate để không phụ thuộc
          // việc mock locator có evaluate hay không (test selfcheck).
          await frame.evaluate(uid => {
            const el = document.querySelector(`[data-ux-card-id="${uid}"]`);
            if (!el) return;
            el.setAttribute('data-ux-opened', '1');
            const form = el.closest('form') || (el.tagName.toLowerCase() === 'form' ? el : null);
            if (form) form.setAttribute('data-ux-opened', '1');
          }, card.uid).catch(() => {});
          openedCount += 1;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch {} finally { releaseTabSlot?.(); }
    }
  } catch {}
  return openedCount;
}
export { handleOfferwallCards };
