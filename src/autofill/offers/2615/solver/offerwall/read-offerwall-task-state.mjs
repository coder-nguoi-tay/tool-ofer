// Bản giải riêng của offer 2615, chép từ src/autofill/offerwall/read-offerwall-task-state.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
/**
 * Đọc card Addept đầu tiên theo vị trí hiển thị trên xuống dưới, trái sang phải, hoặc CTA/Skip đang mở.
 * @return {object|null} Thao tác tiếp theo và định danh card/link, không đọc vùng điều hướng.
 * @throws {never} View model không hợp lệ chỉ bỏ metadata, không đổi thứ tự card.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export function readOfferwallTaskState() {
  const excluded = 'header, footer, nav, aside, [role="complementary"], .sidebar, .ow-attribution';
  /**
   * Chỉ nhận control đang hiển thị trong vùng nghiệp vụ của offerwall.
   * @param {Element|null} element Card, CTA hoặc Skip cần kiểm tra.
   * @return {boolean} True khi control và tổ tiên còn hiển thị.
   * @throws {never} Control không tồn tại được xem là không hiển thị.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-15
   */
  const visible = element => {
    if (!element || element.closest(excluded)) return false;
    for (let parent = element; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (parent.hidden || parent.hasAttribute('inert') || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    }
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0;
  };
  const panel = document.querySelector('#infoPanel');
  if (visible(panel)) {
    for (const card of document.querySelectorAll('.unit-stack [data-ux-ow-awaiting-panel="1"]')) {
      card.removeAttribute('data-ux-ow-awaiting-panel');
      card.setAttribute('data-ux-ow-clicked', '1');
    }
    const cta = panel.querySelector('#infoPanelButton');
    if (visible(cta) && (cta.innerText || '').trim() && cta.getAttribute('data-ux-ow-cta') !== '1') {
      const raw = cta.getAttribute('href') || cta.getAttribute('data-destination-url') || '';
      let destUrl = '';
      try { if (raw && !/^(#|javascript:)/i.test(raw)) destUrl = new URL(raw, document.baseURI).href; } catch {}
      return { kind: 'cta', selector: '#infoPanel #infoPanelButton', destUrl };
    }
    const skip = Array.from(document.querySelectorAll('#skipButton, #closeButton, #infoPanelClose')).find(visible);
    return visible(skip) ? { kind: 'skip', selector: `#${skip.id}` } : null;
  }
  const cards = Array.from(document.querySelectorAll('.unit-stack .unit-card'));
  // Bấm thẻ mà khung chi tiết không hiện sau 5 giây (biến thể mở thẳng offer): coi thẻ đã xử lý, không chờ mãi.
  for (const card of cards) {
    if (card.getAttribute('data-ux-ow-awaiting-panel') !== '1') continue;
    if (Date.now() - Number(card.getAttribute('data-ux-ow-awaiting-since') || 0) < 5000) continue;
    card.removeAttribute('data-ux-ow-awaiting-panel');
    card.setAttribute('data-ux-ow-clicked', '1');
  }
  if (cards.some(card => visible(card) && card.getAttribute('data-ux-ow-awaiting-panel') === '1')) return { kind: 'waiting' };
  const card = cards.filter(element => visible(element) && element.getAttribute('data-ux-ow-clicked') !== '1').sort((first, second) => {
    const firstBounds = first.getBoundingClientRect();
    const secondBounds = second.getBoundingClientRect();
    return firstBounds.top - secondBounds.top || firstBounds.left - secondBounds.left;
  })[0];
  if (!card) return null;
  const index = cards.indexOf(card);
  card.setAttribute('data-ux-ow-task-id', String(index));
  let model = {};
  try { model = JSON.parse(card.getAttribute('data-creative-view-model') || '{}') || {}; } catch {}
  const headline = String(model.headline || card.innerText || '').trim();
  let destUrl = '';
  try { if (model.url) destUrl = new URL(model.url, document.baseURI).href; } catch {}
  const taskCard = { offerId: `addept:${model.id || model.creativeId || `${card.getAttribute('data-index') || index}:${headline}`}`, title: headline, destUrl, sourceUrl: location.href };
  // Biến thể blissxo (2026-11-16): nút .unit-button trong thẻ mở thẳng offer sang tab mới, bấm thân thẻ không mở khung.
  const button = Array.from(card.querySelectorAll('.unit-actions .unit-button, .unit-button')).find(visible);
  if (button) {
    button.setAttribute('data-ux-ow-task-button', String(index));
    return { kind: 'button', selector: `.unit-stack [data-ux-ow-task-button="${index}"]`, cardSelector: `.unit-stack [data-ux-ow-task-id="${index}"]`, headline, card: taskCard };
  }
  return {
    kind: 'card', selector: `.unit-stack [data-ux-ow-task-id="${index}"]`, headline,
    card: { offerId: `addept:${model.id || model.creativeId || `${card.getAttribute('data-index') || index}:${headline}`}`, title: headline, destUrl, sourceUrl: location.href }
  };
}
