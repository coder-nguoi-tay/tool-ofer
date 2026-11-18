/**
 * Đọc thẻ offer và định danh bền vững, ưu tiên URL của CTA thay vì link chính sách trong footer.
 * @param {string|object} cardSelector Selector hoặc selector/preferLeafCards để tách từng card trong wrapper.
 * @return {object[]} Thẻ chưa xử lý, selector node, định danh offer và đích điều hướng.
 * @throws {Error} Khi selector không hợp lệ trong DOM hiện tại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
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
    const primaryLink = links.find(link => (!/^(#|javascript:)/i.test(link.getAttribute('href') || '') || link.hasAttribute('onclick')) && !/\/policies\/|\/privacy|\/terms|\/contact|accessibility|myprivacyrequest/i.test(link.href));
    let action = button || primaryLink || (card.hasAttribute('onclick') || card.matches('[role=button],[role=link]') ? card : null);
    if (action?.matches('a[href]') && /^(#|javascript:)/i.test(action.getAttribute('href') || '') && !action.hasAttribute('onclick')) action = null;
    const target = action?.getAttribute('formtarget') ?? action?.getAttribute('target') ?? action?.form?.getAttribute('target') ?? document.querySelector('base[target]')?.getAttribute('target') ?? '_self';
    const hasNativeNavigation = action?.matches('a[href],area[href]') || action?.form && action.matches('button:not([type=button]):not([type=reset]),input[type=submit],input[type=image]');
    // Nút JavaScript không có đích HTML rõ ràng vẫn cần đặt chỗ; chỉ website quyết định có mở tab hay không.
    const opensAuxiliaryContext = !hasNativeNavigation || !['', '_self', '_parent', '_top'].includes(target.toLowerCase()) && !Array.from(document.querySelectorAll('iframe[name]')).some(frame => frame.name === target);
    let destUrl = action?.getAttribute('href') || card.getAttribute('data-destination-url') || action?.getAttribute('data-destination-url') || primaryLink?.getAttribute('href') || '';
    if (destUrl && !/^(#|javascript:)/i.test(destUrl)) { try { destUrl = new URL(destUrl, document.baseURI).href; } catch {} } else destUrl = '';
    const offerId = card.getAttribute('data-offer-id') || card.getAttribute('data-campaign-id') || card.getAttribute('data-creative-id') || card.id || Array.from(form?.querySelectorAll('input[type=hidden]') || []).find(input => /(?:offer|campaign|creative)[_-]?id$/i.test(input.name))?.value || '';
    let uid = card.getAttribute('data-ux-card-id');
    if (!uid) { uid = `offerwall_card_${index}_${Date.now()}_${Math.random().toString(36).slice(2)}`; card.setAttribute('data-ux-card-id', uid); }
    const title = (card.querySelector('h1,h2,h3,.offer-title,.title')?.textContent || card.getAttribute('aria-label') || card.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    let buttonUid = action?.getAttribute('data-ux-offer-cta-id');
    if (action && !buttonUid) { buttonUid = `${uid}-action-${Math.random().toString(36).slice(2)}`; action.setAttribute('data-ux-offer-cta-id', buttonUid); }
    const actionLabel = (action?.innerText || action?.value || '').replace(/\s+/g, ' ').trim();
    const actionIdentity = action?.getAttribute('onclick') || form?.getAttribute('action') || '';
    return [{ uid, hasBtn: Boolean(action), opensAuxiliaryContext, destUrl, offerId, title, actionIdentity, buttonUid, actionLabel, sourceUrl: document.baseURI }];
  });
}
