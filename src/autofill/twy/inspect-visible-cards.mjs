/**
 * Tìm câu trả lời và nút chuyển bước đang hiển thị của campaign hiện tại.
 * @param {object} args Phạm vi form và tỷ lệ lựa chọn của widget Twy.
 * @return {object|null} Quyết định thao tác hoặc null khi không có campaign hiển thị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function inspectVisibleTwyCards(args) {
  /**
   * Xét cả tổ tiên để bỏ radio, Continue hoặc campaign thuộc bước ẩn.
   * @param {Element} element Phần tử widget cần kiểm tra.
   * @return {boolean} Phần tử đang hiển thị trong scope và không bị khóa.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  const visible = element => {
    if (!element || args.formScope && !element.matches(args.formScope.memberSelector)) return false;
    if (element.matches(':disabled') || element.closest('[aria-disabled="true"], [aria-busy="true"]')) return false;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (ancestor.hidden || ancestor.hasAttribute('inert') || style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || style.opacity === '0') return false;
    }
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0;
  };
  /**
   * Nhận radio native ẩn khi có nhãn liên kết đang hiển thị.
   * @param {Element|null} input Lựa chọn Yes/No cần kiểm tra.
   * @return {boolean} Có control hoặc nhãn để click thật.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  const answerVisible = input => Boolean(input && (visible(input) || Array.from(input.labels || []).some(visible)));
  const cards = Array.from(document.querySelectorAll('[class*="twy-campaign-container"], [id^="twy-campaign"]:not([id^="twy-campaigns"])')).filter(visible);
  if (!cards.length) return null;
  let answer = null;
  let pendingCard = null;
  for (const card of cards) {
    const choices = Array.from(card.querySelectorAll('input[id*="twyinputyes-"], .twy-opt-yes, input[id*="twyinputno-"], .twy-opt-no')).filter(answerVisible);
    if (!choices.length || choices.some(input => input.checked)) continue;
    pendingCard = card;
    const preferNo = Math.random() < args.ratio;
    answer = choices.find(input => /twyinputno-|twy-opt-no|checkboxNo/.test(input.id + ' ' + input.className) === preferNo) || choices[0];
    break;
  }
  const next = Array.from(document.querySelectorAll('[id^="twy-buttonnext-"], .twy-buttonnext, .Buttons .Next a, li.Next > a, a.Next')).find(visible);
  /**
   * Gán marker cho chính node đã xác minh để không click nhầm id trùng ở campaign khác.
   * @param {Element|null} element Control sẵn sàng của campaign hiện tại.
   * @return {string|null} Selector duy nhất của control.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  const selectorFor = element => {
    if (!element) return null;
    const marker = crypto.randomUUID();
    element.setAttribute('data-ux-twy-target', marker);
    return `[data-ux-twy-target="${marker}"]`;
  };
  return {
    answerSel: selectorFor(answer), continueSel: selectorFor(next),
    state: { visibleCards: cards.length, pendingCardId: pendingCard?.id || null, continueBtnId: next?.id || null },
  };
}
