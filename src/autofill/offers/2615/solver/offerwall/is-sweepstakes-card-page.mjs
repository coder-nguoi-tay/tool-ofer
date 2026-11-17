// Bản giải riêng của offer 2615, chép từ src/autofill/offerwall/is-sweepstakes-card-page.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
import { OFFERWALL_CARD_SELECTOR } from '../state/offerwall-card-selector.mjs';
import { getAddeptOfferFrame } from './get-addept-offer-frame.mjs';

const excludedRegions = 'header, footer, nav, aside, [role="complementary"], .sidebar, [role="navigation"], [role="banner"], [role="contentinfo"], .site-header, .site-footer, .ow-attribution';
export const SWEEPSTAKES_IFRAME_CARD_SELECTOR = `:is(${OFFERWALL_CARD_SELECTOR}, .card:has(a[href])):not(:is(${excludedRegions}), :is(${excludedRegions}) *)`;
const centralRegions = '#alpha-intent-content, main, [role="main"], html:not(:has(#alpha-intent-content, main, [role="main"])) :is(form, .offerwall, .offers-list, .offerwall-list, .ai-content--offer-wall)';
export const SWEEPSTAKES_CARD_SELECTOR = `:is(${centralRegions}) ${SWEEPSTAKES_IFRAME_CARD_SELECTOR}, :is(${centralRegions})${SWEEPSTAKES_IFRAME_CARD_SELECTOR}`;

/**
 * Nhận màn cuối SweepstakesAlerts có card/link hoặc placement Addept đang tải.
 * @param {object} page Tab cần nhận diện, không dựa riêng vào phần trăm tiến độ.
 * @return {Promise<boolean>} True khi đủ bằng chứng màn card cần giữ làm trang gốc.
 * @throws {never} Trang đang điều hướng hoặc không đọc được được bỏ qua.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export async function isSweepstakesCardPage(page) {
  try {
    const url = new URL(page.url());
    if (!['sweepstakesalerts.com', 'www.sweepstakesalerts.com'].includes(url.hostname)) return false;
    if (await getAddeptOfferFrame(page)) return true;
    return await page.evaluate(selector => {
      const progress = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--progressPercentage'));
      if (!(progress >= 98 && progress <= 100)) return false;
      return Array.from(document.querySelectorAll(selector)).some(card => {
        if (!card.getClientRects().length || getComputedStyle(card).visibility === 'hidden') return false;
        return [card, ...card.querySelectorAll('a[href], [data-destination-url]')].some(link => {
          try {
            if (link.closest('header, footer, nav, aside, [role="complementary"], .sidebar, [role="navigation"], [role="banner"], [role="contentinfo"], .site-header, .site-footer, .ow-attribution')) return false;
            const raw = link.getAttribute('href') || link.getAttribute('data-destination-url');
            if (!raw || /^(#|javascript:)/i.test(raw)) return false;
            const destination = new URL(raw, document.baseURI);
            return /^https?:$/.test(destination.protocol) && !/\/(?:privacy|terms|policies|contact|accessibility)(?:[-_/.?]|$)/i.test(destination.pathname)
              && destination.href !== location.href && link.getClientRects().length > 0;
          } catch { return false; }
        });
      });
    }, SWEEPSTAKES_CARD_SELECTOR);
  } catch { return false; }
}
