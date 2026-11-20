/**
 * Chạy trong trang (`frame.evaluate`): nhận diện công việc offer trong main/cột nội dung trung tâm.
 * Search, vùng điều hướng/sidebar và link bài viết không được tính là form/câu hỏi offer.
 * Link/media thường chỉ chứng minh trang không trắng; link offer cần ngữ cảnh offerwall rõ ràng.
 *
 * @param {object} [options] subTab giới hạn vùng nội dung. loadingOnly chỉ đọc trạng thái tải ở trang cha. remainingIframeWork loại các control đã khóa. frameStatus phân biệt iframe trắng.
 * @return {object} Trạng thái tải, bằng chứng tương tác và nội dung đang hiển thị trong tài liệu.
 * @throws {Error} Khi tài liệu bị hủy trong quá trình quét.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function detectOfferContentInPage({ subTab = false, frameStatus = false, loadingOnly = false, remainingIframeWork = false } = {}) {
  const mainSelector = 'main, [role="main"], #main, #content, .main-content, .site-main';
  const scopeSelector = 'form, [role="form"], fieldset, [role="group"], [role="dialog"], [aria-modal="true"], ' +
    '[id^="sign_up_step"], [id^="twy-campaigns-"], .twy-campaigns, .twy-customquestion, ' +
    '.form-step, .survey-step, .step.active, .current-step, .form-container, .survey-container, .quiz-container, .question-container, [data-question-id]' +
    (subTab ? ', .Survey .Qst' : '');
  const offerCardSelector = '.offerwall-card-wrap, .offerwall-card, form[data-tf-element-role="offer"]:not([data-object-type="form"]), .campaign-card, ' +
    '.offer-container-v2, .offer-item, .reward-card, .offer-tile, .tile-offer, .offers-list .card, ' +
    '[data-offer-id], [data-campaign-id], [data-creative-id], [data-mock-secondary-offer-card], [class*="offer"][class*="card"]';
  const excludedSelector = 'header, nav, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"], ' +
    '#footer, .footer, .site-footer, .sidebar, .side-bar, .left-sidebar, .right-sidebar, #sidebar, #left-sidebar, #right-sidebar, ' +
    '.cookie-banner, .cookie-consent, [class*="cookie-banner"], [class*="cookie-consent"]' +
    (subTab ? ', [aria-hidden="true"], [role="search"], [class*="newsletter" i], [id*="newsletter" i], [class*="footer" i], [id*="footer" i]' : '');
  const shown = element => {
    if (!element) return false;
    for (let parent = element; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (parent.hidden || parent.hasAttribute('inert') || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    }
    return element.getClientRects().length > 0;
  };
  const chrome = element => {
    const consumed = element.closest('[data-ux-offer-action-label]');
    return Boolean(element.closest(excludedSelector)) || Boolean(consumed && (consumed.innerText || consumed.value || '').replace(/\s+/g, ' ').trim() === consumed.getAttribute('data-ux-offer-action-label'));
  };
  const hasVisibleMain = subTab && [...document.querySelectorAll(mainSelector)].some(shown);
  const inOfferArea = element => {
    const main = element.closest(mainSelector);
    if (main && shown(main)) return true;
    if (hasVisibleMain && !element.closest('[role="dialog"], dialog[open]')) return false;
    const scope = element.closest(scopeSelector + (subTab ? ', .q' : '') + ', section, article, .question, .questions, .answers, .options, .button-group, .buttons');
    const label = Array.from(element.labels || []).find(shown);
    const target = scope || label || element;
    if (!shown(target)) return false;
    const rect = target.getBoundingClientRect();
    const width = window.innerWidth || document.documentElement.clientWidth || 0;
    const height = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!width || !height || rect.width <= 0 || rect.height <= 0) return false;
    if (subTab ? rect.bottom + window.scrollY <= 0 : rect.bottom <= 0 || rect.top >= height) return false;
    const centerX = rect.left + rect.width / 2;
    return centerX >= width * 0.2 && centerX <= width * 0.8;
  };
  const loading = document.readyState !== 'complete' || [...document.querySelectorAll('[aria-busy="true"],.spinner,.loading')].some(element =>
    shown(element) && (!subTab || !chrome(element) && inOfferArea(element)));
  const challenge = /just a moment|checking your browser/i.test(document.title);
  if (loadingOnly) return { loading, challenge, hasForm: false };

  /**
   * Loại control chỉ dùng để hiển thị lại kết quả và nhãn của control đó.
   * @param {Element} element Phần tử cần xét trong tài liệu hiện tại.
   * @return {boolean} Control bị khóa khi kiểm tra công việc còn lại của iframe.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-19
   */
  const locked = element => {
    if (!remainingIframeWork) return false;
    const control = element.control || element;
    return control.matches(':disabled, [readonly]') || Boolean(control.closest('[aria-disabled="true"], [aria-readonly="true"]'));
  };
  const isSearchField = element => {
    const type = (element.type || '').toLowerCase();
    if (type === 'search' || element.getAttribute('role') === 'searchbox' || element.closest('[role="search"]')) return true;
    if (!['', 'text', 'textarea'].includes(type)) return false;
    const form = element.form || element.closest('form');
    const action = form?.getAttribute('action') || '';
    if (/(?:^|\/)(?:search|tim-kiem)(?:[/?#]|$)/i.test(action)) return true;
    const nameAndId = [element.name || '', element.id || ''].map(value => value.toLowerCase().replace(/[-_]/g, ''));
    if (nameAndId.some(value => /^(q|query|search|searchinput|searchquery|searchbox|keyword|keywords)$/.test(value))) return true;
    const hint = `${element.placeholder || ''} ${element.getAttribute('aria-label') || ''}`;
    if (/search|tìm kiếm|what are you looking for/i.test(hint)) return true;
    if (!form) return false;
    const hasSearchButton = [...form.querySelectorAll('button, input[type="submit"]')].some(button =>
      /^(search|tìm kiếm)$/i.test((button.innerText || button.value || button.getAttribute('aria-label') || '').trim())
    );
    return hasSearchButton;
  };
  const noise = /close|skip ad|learn more|ad ?choices|privacy|cookie|accept|reject|agree|menu|share|tweet|facebook|sign in|log ?in|sign up|subscribe|search|next article|read more/i;
  const fieldSel = 'input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="date"], ' +
    'input[type="radio"], input[type="checkbox"], select, textarea' +
    (subTab ? ', input[type="password"], input[type="range"], input[type="time"], input[type="datetime-local"], [role="textbox"], [role="combobox"], [contenteditable="true"]' : '');
  const hasForm = [...document.querySelectorAll(fieldSel)].some(element => {
    if (locked(element) || (!shown(element) && !Array.from(element.labels || []).some(shown)) || chrome(element) || !inOfferArea(element) || isSearchField(element)) return false;
    const hint = `${element.name || ''} ${element.id || ''} ${element.placeholder || ''} ${element.getAttribute('aria-label') || ''}`;
    return !/newsletter/i.test(hint);
  });

  const yesNoGroups = new Map();
  for (const element of document.querySelectorAll('button,label,a,[role="radio"],[role="button"],[onclick],.btn-option')) {
    if (locked(element) || !shown(element) || chrome(element) || !inOfferArea(element)) continue;
    const answer = (element.innerText || element.getAttribute('aria-label') || '').trim().toLowerCase();
    if (!['yes', 'no', 'có', 'không'].includes(answer)) continue;
    const parent = element.closest(scopeSelector + ', section, article, ' + mainSelector) || element.parentElement;
    const group = yesNoGroups.get(parent) || { yes: false, no: false };
    if (['yes', 'có'].includes(answer)) group.yes = true;
    else group.no = true;
    yesNoGroups.set(parent, group);
  }

  const groups = new Map();
  const choiceSel = '[role="radio"], [role="option"], [role="checkbox"], button, label, a[class*="btn"], a[class*="answer"], a[class*="option"], ' +
    '[class*="answer"], [class*="option"], [class*="choice"], [data-answer], [data-choice]' +
    (subTab ? ', a[href^="#"][onclick]' : '');
  for (const element of document.querySelectorAll(choiceSel)) {
    const text = String(element.innerText || '').trim();
    if (!text || text.length > 60 || noise.test(text) || locked(element) || !shown(element) || chrome(element) || !inOfferArea(element)) continue;
    const parent = element.parentElement;
    const group = groups.get(parent) || { styled: 0, total: 0, question: false };
    group.total += 1;
    if (element.matches('[role="radio"], [role="option"], [role="checkbox"], [class*="answer"], [class*="option"], [class*="choice"], [data-answer], [data-choice]')) group.styled += 1;
    const contextText = String(parent?.innerText || '').trim();
    if ((!remainingIframeWork && parent?.closest(scopeSelector)) || /\?|what|which|choose|select|bạn|hãy chọn/i.test(contextText)) group.question = true;
    groups.set(parent, group);
  }
  const hasChoices = [...yesNoGroups.values()].some(group => group.yes && group.no) || [...groups.values()].some(group => group.styled >= 2 || group.total >= 2 && group.question);

  if (subTab) {
    const hasQuestion = [...document.querySelectorAll('fieldset legend, [data-question-id], .question-title, .question-text, [role="radiogroup"][aria-label], .survey-container h2, .quiz-container h2, .question-container h2')].some(element => {
      const text = (element.innerText || element.getAttribute('aria-label') || '').trim();
      if (!text || !shown(element) || chrome(element) || locked(element) || !inOfferArea(element)) return false;
      if (!remainingIframeWork) return true;
      const question = element.closest('[data-question-id], [role="radiogroup"], fieldset, .question-container, .Survey .Qst, form');
      if (!hasForm && !hasChoices && question) {
        const controls = Array.from(question.querySelectorAll(fieldSel + ', button, [role="radio"], [role="checkbox"], [role="option"]'));
        if (controls.length && controls.every(locked)) return false;
      }
      if (/^(thank you\b|thanks\b|survey (?:complete|finished)|cảm ơn|đã hoàn (?:tất|thành))/i.test(text)) return false;
      return !element.matches('h2:not(.question-title):not(.question-text):not([data-question-id])') || /[?？]|^(?:please\s+)?(?:select|choose|enter|rate)\b|^(?:hãy |vui lòng )/i.test(text);
    });
    const evidence = { loading, challenge, hasForm, hasChoices, hasQuestion };
    if (frameStatus) {
      const statusBar = document.getElementById('__autolead_ip_bar')?.innerText || '';
      evidence.hasRenderedContent = Boolean((document.body?.innerText || '').replace(statusBar, '').trim());
    }
    return evidence;
  }
  const progressPattern = /^(continue|next|next step|submit|start survey|take survey|tiếp tục|tiếp theo|gửi)\s*[→›»!]*$/i;
  const hasFormProgress = [...document.querySelectorAll('button,a,[role="button"],input[type="submit"]')].some(element => {
    const form = element.closest('form');
    const searchForm = element.closest('[role="search"]') || /(?:^|\/)(?:search|tim-kiem)(?:[/?#]|$)/i.test(form?.getAttribute('action') || '') || [...form?.querySelectorAll('button, input[type="submit"]') || []].some(button =>
      /^(search|tìm kiếm)$/i.test((button.innerText || button.value || button.getAttribute('aria-label') || '').trim())
    );
    if (!shown(element) || chrome(element) || !inOfferArea(element) || searchForm) return false;
    const label = (element.innerText || element.value || element.getAttribute('aria-label') || '').trim();
    const scoped = element.closest(scopeSelector);
    const explicitAction = element.closest('[data-action*="continue"], [data-vector-submit], [data-tf-element-role="submit"], [data-loco-role="submit"], [data-loco-action="submit"]');
    const nativeSubmit = element.matches('button[type="submit"], input[type="submit"], form button:not([type])') && element.closest('form');
    const disabledProgress = (element.disabled || element.getAttribute('aria-disabled') === 'true') && element.matches('button, input') && progressPattern.test(label);
    return Boolean(explicitAction || nativeSubmit || disabledProgress || scoped && progressPattern.test(label));
  });

  const hasOfferEntry = [...document.querySelectorAll('a[href], button, [role="button"], [data-destination-url], [data-tf-element-role="offer-btn"], [data-mock-secondary-offer-action]')].some(element => {
    if (!shown(element) || chrome(element) || !inOfferArea(element)) return false;
    const card = element.closest(offerCardSelector);
    const explicit = element.closest('[data-tf-element-role="offer-btn"], [data-mock-secondary-offer-action], [data-destination-url], .offerwall-btn, .offer-button, .btn-offer, .claim-button, [id^="ct-creative-submit-"]');
    if (!card && !explicit) return false;
    const text = `${element.innerText || element.value || ''} ${element.getAttribute('href') || ''}`;
    return !/policies|privacy|terms|contact|accessibility|myprivacyrequest|learn more|read more/i.test(text);
  });

  const worked = Boolean(document.querySelector('[data-ux-filled], [data-ux-clicked], [data-ux-qclicked], [data-ux-semantic-clicked], [data-ux-submitted], ' +
    '[data-ux-opened], [data-ux-mui-clicked], [data-ux-soi-done], [data-ux-ow-clicked], [data-ux-autofill-owner], [data-ux-typing], ' +
    '[data-ux-semantic-answered], [data-ux-answer-attempt-at]'));
  const hasOfferWork = hasForm || hasChoices || hasFormProgress || hasOfferEntry;
  const visibleText = (document.body?.innerText || document.body?.textContent || '').trim();
  const hasVisibleMedia = [...document.querySelectorAll('img, canvas, video, picture, svg')].some(shown);
  const hasVisibleLink = [...document.querySelectorAll('a[href]')].some(shown);
  const noOfferContent = !loading && !challenge && !worked && !hasOfferWork && !hasVisibleMedia && !hasVisibleLink;
  return {
    loading,
    challenge,
    worked,
    hasForm,
    hasChoices,
    hasFormProgress,
    hasOfferEntry,
    hasOfferWork,
    empty: noOfferContent && !visibleText,
    singleLine: noOfferContent && visibleText.length > 0 && visibleText.length <= 300 && visibleText.split(/\r?\n/).filter(line => line.trim()).length <= 1
  };
}
