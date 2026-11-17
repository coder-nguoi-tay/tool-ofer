// Bản giải riêng của offer 2615, chép từ src/autofill/read-offerwall-cards.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
/**
 * Đọc thẻ offer và định danh bền vững, ưu tiên URL của CTA thay vì link chính sách trong footer.
 * @param {string|object} cardSelector Selector hoặc selector/preferLeafCards để tách từng card trong wrapper.
 * @return {object[]} Thẻ chưa xử lý, selector node, định danh offer và đích điều hướng.
 * @throws {Error} Khi selector không hợp lệ trong DOM hiện tại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export function readOfferwallCards(cardSelector) {
  const excludedRegions = 'header, footer, nav, aside, [role="complementary"], .sidebar, [role="navigation"], [role="banner"], [role="contentinfo"], .site-header, .site-footer, .ow-attribution';
  const allCards = Array.from(document.querySelectorAll(cardSelector.selector || cardSelector)).filter(card => !card.closest(excludedRegions));
  const cards = allCards.filter(card => !allCards.some(other => other !== card && (cardSelector.preferLeafCards ? card.contains(other) : other.contains(card))));
  if (cardSelector.preferLeafCards) cards.sort((first, second) => {
    const firstBounds = first.getBoundingClientRect();
    const secondBounds = second.getBoundingClientRect();
    return firstBounds.top - secondBounds.top || firstBounds.left - secondBounds.left;
  });
  return cards.flatMap((card, index) => {
    if (card.getAttribute('data-ux-opened') === '1') return [];
    const soi = card.getAttribute('data-object-creative-type') === 'soiyesno' || card.querySelector('[data-object-creative-type="soiyesno"]');
    if (soi) { if (card.getAttribute('data-ux-soi-done') === '1') card.setAttribute('data-ux-opened', '1'); return []; }
    const form = card.closest('form');
    const button = Array.from(card.querySelectorAll('.offerwall-btn,button[type="submit"],button#btnSubmit,[data-tf-element-role="offer-btn"],a[id^="ct-creative-submit-"],button[id^="ct-creative-submit-"],.ct-creative-submit,.ai-submit-button,button.question-answer-button,button[id^="answer-"],.eligibility-btn,[data-mock-secondary-offer-action],.offer-button,.btn-offer,.claim-button,a[class*="offer"],button[class*="offer"]')).find(element => !element.closest(excludedRegions));
    const links = Array.from(card.querySelectorAll('a[href]')).filter(link => !link.closest(excludedRegions));
    const primaryLink = links.find(link => !/\/policies\/|\/privacy|\/terms|\/contact|accessibility|myprivacyrequest/i.test(link.href));
    let destUrl = card.getAttribute('data-destination-url') || button?.getAttribute('href') || button?.getAttribute('data-destination-url') || primaryLink?.getAttribute('href') || '';
    if (destUrl && !/^(#|javascript:)/i.test(destUrl)) { try { destUrl = new URL(destUrl, document.baseURI).href; } catch {} } else destUrl = '';
    const offerId = card.getAttribute('data-offer-id') || card.getAttribute('data-campaign-id') || card.getAttribute('data-creative-id') || card.id || Array.from(form?.querySelectorAll('input[type=hidden]') || []).find(input => /(?:offer|campaign|creative)[_-]?id$/i.test(input.name))?.value || '';
    let uid = card.getAttribute('data-ux-card-id');
    if (!uid) { uid = `offerwall_card_${index}_${Date.now()}_${Math.random().toString(36).slice(2)}`; card.setAttribute('data-ux-card-id', uid); }
    const title = (card.querySelector('h1,h2,h3,.offer-title,.title')?.textContent || card.getAttribute('aria-label') || card.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    let buttonUid = button?.getAttribute('data-ux-offer-cta-id');
    if (button && !buttonUid) { buttonUid = `${uid}-action-${Math.random().toString(36).slice(2)}`; button.setAttribute('data-ux-offer-cta-id', buttonUid); }
    const actionLabel = (button?.innerText || button?.value || '').replace(/\s+/g, ' ').trim();
    const actionIdentity = button?.getAttribute('onclick') || form?.getAttribute('action') || '';
    return [{ uid, hasBtn: Boolean(button), destUrl, offerId, title, actionIdentity, buttonUid, actionLabel, sourceUrl: document.baseURI }];
  });
}
