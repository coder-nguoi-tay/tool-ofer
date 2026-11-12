/**
 * Chụp cấu trúc câu hỏi đang hiển thị, loại trạng thái chọn và marker của tool khỏi định danh bước.
 * @param {object|null} formScope Phạm vi biểu mẫu hiện tại.
 * @return {object} URL, định danh nội dung câu hỏi và trạng thái có control/câu hỏi được hỗ trợ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function inspectQuestionState(formScope) {
  /**
   * Bỏ control và heading thuộc bước ẩn hoặc form khác.
   * @param {Element} element Phần tử cần đọc.
   * @return {boolean} Phần tử đang hiển thị trong scope.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  const visible = element => {
    if (!element || formScope && !element.matches(formScope.memberSelector)) return false;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (ancestor.hidden || ancestor.hasAttribute('inert') || style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || style.opacity === '0') return false;
    }
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0;
  };
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,legend,.question-title,.question-text,.twy-cqlabel,#questionText')).filter(visible).map(element => element.textContent.replace(/\s+/g, ' ').trim());
  const controls = Array.from(document.querySelectorAll('input:not([type="hidden"]),select,textarea,button,[role="radio"],[role="checkbox"],[role="button"],a.option,a.choice,a[data-next],.btn-option,.choice-btn,.option-btn,.star,[data-star],.matrix-cell'));
  const activeControls = controls.filter(element => visible(element) || element.matches('input[type="radio"],input[type="checkbox"]') && Array.from(element.labels || []).some(visible));
  const questionControls = activeControls.filter(element => !element.matches('button[type="submit"],input[type="submit"]') && !/^(continue|next|submit|back|cancel|skip|finish|done)\b/i.test((element.innerText || element.value || '').trim()));
  // step: id của khối cha gần nhất — form nhiều bước (sign_up_step3 → step4) có nút Yes/No cùng nhãn, không id/name;
  // thiếu field này thì chuyển bước không đổi identity và bị coi là "chưa xác nhận" (log 2026-11-12, chờ 18,5s).
  const identity = JSON.stringify({ headings, controls: questionControls.map(element => ({ id: element.id, name: element.getAttribute('name'), step: element.parentElement?.closest('[id]')?.id || '', type: element.type || element.getAttribute('role') || element.tagName, label: element.matches('input,textarea,select') ? Array.from(element.labels || []).map(label => label.textContent.trim()).join(' ') : element.textContent.trim(), options: element.tagName === 'SELECT' ? Array.from(element.options).map(option => [option.value, option.text]) : undefined })) });
  const text = (formScope ? document.querySelector(formScope.rootSelector) : document.body)?.innerText || '';
  const supported = questionControls.filter(element => element.matches('select,input[type="checkbox"],[role="checkbox"]') || element.closest('.rating-scale,.nps-scale,.star-rating,.stars,.matrix-row,.grid-row,table.matrix,table.survey-matrix'));
  return { available: true, url: location.href, identity, headings, questionKeys: JSON.parse(identity).controls.map(control => JSON.stringify(control)), hasQuestions: questionControls.length > 0, hasControls: activeControls.length > 0, supportedCount: supported.length, hasContent: Boolean(text.trim()), busy: Array.from(document.querySelectorAll('[aria-busy="true"],.spinner,.loading')).some(visible), completed: !questionControls.length && /thank\s*you|completed|submission received|cảm ơn/i.test(text) };
}
