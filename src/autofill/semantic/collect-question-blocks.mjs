/**
 * Gom đáp án theo wrapper gần nhất hoặc heading liền trước, chỉ trong khảo sát đang hiển thị.
 * @param {object} context Patterns phân loại và phạm vi biểu mẫu.
 * @return {object[]} Các block độc lập với heading, loại câu hỏi và selector option duy nhất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function collectQuestionBlocks({ patterns, formScope }) {
  /**
   * Loại bước ẩn, busy và phần tử ngoài phạm vi trước khi chọn đáp án.
   * @param {Element} element Option hoặc heading cần đọc.
   * @return {boolean} Phần tử hiển thị và có thể tham gia block.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  const visible = element => {
    if (!element || formScope && !element.matches(formScope.memberSelector)) return false;
    if (element.matches(':disabled') || element.closest('[aria-busy="true"],[aria-disabled="true"]')) return false;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (ancestor.hidden || ancestor.hasAttribute('inert') || style.display === 'none' || ['hidden','collapse'].includes(style.visibility) || style.opacity === '0') return false;
    }
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0;
  };
  const options = Array.from(document.querySelectorAll('button,input[type="radio"],input[type="checkbox"],[role="radio"],.btn-option,.choice-btn,.option-btn,a[id^="answer-"]')).filter(element => visible(element) || element.matches('input') && Array.from(element.labels || []).some(visible));
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,legend,[role="heading"],.question-text,.question-title,#questionText,strong,p')).filter(element => visible(element) && !options.some(option => option === element || option.contains(element)));
  const groups = new Map();
  const seen = new Set();
  for (const rawOption of options) {
    const option = rawOption.matches('input') ? rawOption.closest('label') || rawOption.labels?.[0] || rawOption : rawOption;
    if (seen.has(option)) continue;
    seen.add(option);
    const label = (option.matches('input') ? Array.from(option.labels || []).map(element => element.innerText).join(' ') : option.innerText || option.textContent).trim();
    if (!label || /^(continue|next|submit|back|cancel|skip|done|finish)$/i.test(label)) continue;
    const wrapper = option.closest('[role="group"],[role="radiogroup"],fieldset,.question,.survey-question,.question-block,.question-card,.survey-card,.card,[data-question-id]');
    const root = wrapper || option.closest('form,section') || document.body;
    const heading = wrapper ? headings.find(element => root.contains(element)) : headings.filter(element => root.contains(element) && (element.compareDocumentPosition(option) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    if (!heading) continue;
    const text = heading.innerText.replace(/\s+/g,' ').trim();
    const questionType = patterns.find(([, pattern]) => new RegExp(pattern).test(text.toLowerCase()))?.[0];
    if (!questionType) continue;
    if (!groups.has(heading)) groups.set(heading, { questionType, heading: text, options: [] });
    const marker = option.getAttribute('data-ux-option-uid') || 'semantic-' + crypto.randomUUID();
    option.setAttribute('data-ux-option-uid', marker);
    option.setAttribute('data-ux-semantic-owned', '1');
    groups.get(heading).options.push(marker);
  }
  return [...groups.values()].filter(group => group.options.length >= 2);
}
