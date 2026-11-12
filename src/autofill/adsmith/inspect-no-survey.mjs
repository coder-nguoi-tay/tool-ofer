/**
 * Đọc lựa chọn No và Continue của bước Adsmith đang hiện; không dùng CTA trang cha hoặc bước ẩn.
 * @return {object|null} Câu hỏi, trạng thái chọn, nút Continue và điều kiện giữ bước.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function inspectNoSurvey() {
  const visible = element => {
    if (!element) return false;
    for (let parent = element; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (parent.hidden || parent.hasAttribute('inert') || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    }
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0;
  };
  const mark = element => {
    if (!element.dataset.uxAdsmithTarget) element.dataset.uxAdsmithTarget = `as-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `[data-ux-adsmith-target="${element.dataset.uxAdsmithTarget}"]`;
  };
  // Chữ nút có thể kèm ký tự phụ ("Continue »", "NEXT >"): so trên phần chữ cái.
  const isNextText = (element, pattern) => pattern.test(element.textContent.replace(/[^a-z\s]/gi, ' ').replace(/\s+/g, ' ').trim());
  const survey = Array.from(document.querySelectorAll('.Survey')).find(visible);
  const activePage = survey && Array.from(survey.querySelectorAll('.OfferPage.Active')).find(visible);
  if (!survey || !activePage) {
    // Màn không có khối câu hỏi (giới thiệu/chuyển tiếp) nhưng có nút tiếp tục: vẫn bấm để không đứng chờ.
    const plainNext = Array.from(document.querySelectorAll('button, a, input[type="submit"], input[type="button"], [role="button"]'))
      .find(element => visible(element) && isNextText(element.tagName === 'INPUT' ? { textContent: element.value || '' } : element, /^(continue|next)\b/i));
    return plainNext ? { identity: `${location.href}:plain`, questions: [], missingNo: false, busy: false, subformOpen: false, next: mark(plainNext) } : null;
  }
  // Quy tắc (người dùng chốt 2026-11-12): chọn Yes cho mọi câu; riêng quảng cáo dầu gội Dove chọn No.
  // Nhận diện Dove: chữ/ảnh/link có "dove", hoặc bấm Yes làm mở .PopInfo có danh sách radio + Save
  // (script Adsmith thêm OpenPI và mở khung; chọn No thì tự đóng). Đánh dấu giữ lại để không quay về Yes.
  const questions = [];
  let missingNo = false;
  const answerLink = (question, kind) => Array.from(question.querySelectorAll(`.Ans li.${kind} a`)).find(element => visible(element) && new RegExp(`^${kind}$`, 'i').test(element.textContent.trim()));
  for (const question of Array.from(activePage.querySelectorAll('.Qst')).filter(visible)) {
    const yes = answerLink(question, 'Yes');
    const no = answerLink(question, 'No');
    const signal = `${question.innerText || ''} ${Array.from(question.querySelectorAll('img')).map(image => `${image.alt} ${image.src}`).join(' ')} ${Array.from(question.querySelectorAll('a[href]')).map(link => link.href).join(' ')}`;
    const radioPopupOpen = Array.from(question.querySelectorAll('.PopInfo')).some(popup => visible(popup) && Array.from(popup.querySelectorAll('input[type="radio"]')).some(visible));
    if (/\bdove\b/i.test(signal) || radioPopupOpen) question.dataset.uxAdsmithPrefer = 'No';
    const target = question.dataset.uxAdsmithPrefer === 'No' ? no || yes : yes || no;
    if (target) questions.push({ selector: mark(target), selected: target.closest('li').classList.contains('Active'), answer: target === no ? 'No' : 'Yes' });
    else if (!question.classList.contains('NotReq')) missingNo = true;
  }
  const textOf = element => element.tagName === 'INPUT' ? { textContent: element.value || '' } : element;
  // DOM thật (survey-def-v2): .Btm chứa Continue là ANH EM của .Survey trong .Wrap, script Adsmith gắn
  // $('body').on('click', '.Buttons li.Next a') — phải tìm ở cấp document, không trong .Survey
  // (log 2026-11-12: chọn No xong không bấm Continue, người dùng phải bấm tay).
  const clickables = Array.from(document.querySelectorAll('a, button, input[type="submit"], input[type="button"], [role="button"]')).filter(element => visible(element) && !element.closest('.Qst, .PopInfo'));
  const next = Array.from(document.querySelectorAll('.Btm .Buttons li.Next a, .Buttons li.Next a')).find(element => visible(element) && !element.closest('.PopInfo') && isNextText(element, /^(continue|next|skip)\b/i))
    || clickables.find(element => isNextText(textOf(element), /^(continue|next|submit|skip)\b/i));
  const busy = Array.from(survey.querySelectorAll('.Processing,[aria-busy="true"]')).some(visible);
  // PopInfo chỉ chặn Continue khi là subform thật (có ô nhập đang hiện); khung chỉ có chữ thì không.
  const subformOpen = Array.from(activePage.querySelectorAll('.PopInfo')).some(popup => visible(popup) && Array.from(popup.querySelectorAll('input:not([type="hidden"]), select, textarea')).some(visible));
  const buttons = clickables.map(element => textOf(element).textContent.replace(/\s+/g, ' ').trim().slice(0, 30)).filter(Boolean).slice(0, 8);
  return { identity: `${location.href}:${activePage.id}:${questions.map(question => question.selector).join('|')}`, questions, missingNo, busy, subformOpen, buttons, next: next ? mark(next) : null };
}
