/**
 * Đọc nhóm checkbox đang hiển thị và số lựa chọn còn thiếu; chỉ gán marker, không tích đáp án.
 * @param {object} context Phạm vi control và mẫu nhận diện câu hỏi nhiều lựa chọn.
 * @return {Array<object>} Nhóm consent hoặc câu hỏi chưa đủ đáp án để solver và submit cùng kiểm tra.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function inspectCheckboxGroups({ patternSources = [], scopeSelector } = {}) {
  /**
   * Chỉ xét control hiển thị thuộc form hoặc khảo sát đang xử lý.
   * @param {Element} control Control hoặc nhãn cần kiểm tra.
   * @return {boolean} Phần tử hợp lệ trong phạm vi hiện tại.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-12
   */
  const isVisible = control => {
    if (scopeSelector && !control?.matches(scopeSelector)) return false;
    if (!control || control.disabled) return false;
    for (let parent = control; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (parent.hidden || parent.hasAttribute('inert') || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    }
    const rect = control.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const groups = new Map();
  const rawCandidates = Array.from(document.querySelectorAll(['input[type="checkbox"]', '[role="checkbox"]', '.custom-checkbox', '.checkbox-card', '.check-card', '.survey-checkbox', '[data-checkbox]', 'label.checkbox', '.form-check:has(input[type="checkbox"])'].join(', '))).map(element => element.matches('input[type=checkbox]') ? element : element.querySelector('input[type=checkbox]') || element);
  const candidates = [...new Set(rawCandidates)].filter(element => isVisible(element) || Array.from(element.labels || []).some(isVisible));
  candidates.forEach((item, index) => {
    // Tìm câu hỏi / container bao bọc gần nhất
    const container = item.closest('.twy-customquestion, .question, .survey-question, fieldset, .checkbox-group, .choices, .form-group, .answers, .step-content') || item.parentElement || document.body;
    if (!groups.has(container)) {
      groups.set(container, []);
    }
    const isChecked = item.tagName === 'INPUT' && item.checked || item.getAttribute('aria-checked') === 'true' || item.classList.contains('checked') || item.classList.contains('active') || item.querySelector('input[type="checkbox"]:checked') !== null;
    const label = item.closest('label') || (item.id ? document.querySelector(`label[for="${item.id}"]`) : null) || item;
    const text = (label?.innerText || label?.textContent || item.value || '').trim();
    const uid = `cb_opt_${index}_${Date.now()}`;
    item.setAttribute('data-survey-cb-uid', uid);
    groups.get(container).push({
      uid,
      text,
      isChecked
    });
  });
  const actionable = [];
  for (const [container, items] of groups.entries()) {
    if (items.length === 2 && items.every(item => /^(yes|no|có|không)$/i.test(item.text))) continue;
    const checkedCount = items.filter(item => item.isChecked).length;
    const headingText = (container.querySelector('h1, h2, h3, h4, legend, .question-title, .twy-cqlabel, p')?.innerText || '').toLowerCase();

    // Heading kiểu "Select all that apply / must pick 2 / chọn tất cả..." là câu hỏi
    // nhiều lựa chọn — không được nhầm thành consent rồi tick toàn bộ options.
    let matchesMultiChoicePattern = false;
    for (const patternSource of patternSources) {
      if (new RegExp(patternSource, 'i').test(headingText)) {
        matchesMultiChoicePattern = true;
        break;
      }
    }
    const multiChoiceHeading = matchesMultiChoicePattern || /\b(pick|select|choose|chọn)\b/i.test(headingText);

    // Consent phải do heading nói về điều khoản/đồng ý, hoặc từng item tự thân là
    // statement consent ("I agree to the Terms..."). Không dùng từ "required/must"
    // chung chung vì dễ bắt nhầm câu hỏi thường (ví dụ "Women must pick 2").
    const consentByHeading = /terms|privacy|consent|agree|accept|waiver|opt[- ]?in/i.test(headingText) && !multiChoiceHeading;
    const consentByItems = items.length <= 2 && items.every(it => /terms|privacy|consent|agree|accept|waiver|opt[- ]?in/i.test(it.text)) && !multiChoiceHeading;
    const minimum = Number(headingText.match(/(?:pick|select|choose|chọn)(?:\s+(?:at\s+least|tối\s+thiểu))?\s+(?:exactly\s+)?(\d+)/i)?.[1] || 1);
    if ((consentByHeading || consentByItems || items.length === 1) && items.some(item => !item.isChecked)) {
      actionable.push({
        type: 'consent',
        items
      });
    } else if (checkedCount < minimum && items.length >= 2) {
      actionable.push({
        type: 'multi_choice',
        minimum,
        countToPick: checkedCount ? minimum - checkedCount : Math.max(2, minimum),
        items
      });
    }
  }
  return actionable;
}
