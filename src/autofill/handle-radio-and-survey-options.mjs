import { handleSiteSurveyAnswers } from './survey/handle-site-survey-answers.mjs';
import { performSurveyAnswer } from '../survey-solver/verification/perform-survey-answer.mjs';
import { locateFormElements } from './form-scope/locate-form-elements.mjs';
import { SURVEY_LEGAL_NOISE_RE } from '../../survey-solver.mjs';
import { SURVEY_NAV_NOISE_RE } from '../../survey-solver.mjs';
import { addActionCount } from './add-action-count.mjs';
import { buildSurveyAnswerSignature } from './build-survey-answer-signature.mjs';
import { calculateAge } from './calculate-age.mjs';
import { isSurveyAnswerHandled } from './is-survey-answer-handled.mjs';
import { markSurveyAnswerHandled } from './mark-survey-answer-handled.mjs';
import { matchAgeRange } from './match-age-range.mjs';
import { naturalMouseDrift } from './natural-mouse-drift.mjs';
import { normalizeFieldName } from './normalize-field-name.mjs';

/**
 * Tự động chọn đáp án khảo sát từ radio hoặc thẻ HTML có class/id thể hiện answer, option, choice, response, kể cả ngoài form.
 * Hỗ trợ giao diện khảo sát và quiz dùng nút, link hoặc thẻ HTML thông thường.
 *
 * @param {object} frame Frame Playwright đang quét.
 * @param {object} [record={}] Bản ghi dữ liệu hiện tại để ưu tiên nếu có cấu hình.
 * @param {object|null} session Phiên browser nhận trạng thái autofill.
 * @param {object} options Callback chẩn đoán và tùy chọn xác minh.
 * @return {Promise<number>} Số câu hỏi đã được chọn/trả lời.
 * @throws {Error} Lỗi thao tác frame được xử lý tại chỗ và không làm dừng phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function handleRadioAndSurveyOptions(frame, record = {}, session = null, options = {}) {
  const answerOptions = { ...options, onLog: options.onLog || session?.addBrowserLog?.bind(session) || session?.addLog?.bind(session) };
  let answeredCount = 0;
  const siteAnswers = await handleSiteSurveyAnswers(frame, answerOptions);
  answeredCount += siteAnswers.answered;
  if (siteAnswers.answered && session) {
    session.lastActionTime = Date.now();
    session.answerClickPending = true;
    addActionCount(session, siteAnswers.answered);
  }
  if (siteAnswers.advanced) return answeredCount;

  // 0. ƯU TIÊN CAO NHẤT: Đáp ứng yêu cầu "chủ động bấm nút trong btn-option" và "các phần trả lời đáp án chọn random trong danh sách các id='btn-option' cứ hiện là chọn"
  // Tự động tìm tất cả đáp án có id="btn-option", id/class chứa "btn-option" HOẶC CÁC NÚT BÊN TRONG btn-option, gom nhóm và chọn ngay khi xuất hiện
  try {
    const btnOptionGroups = await frame.evaluate(({ scopeSelector, legalNoiseSource, navigationNoiseSource }) => {
      const SURVEY_LEGAL_NOISE_RE = new RegExp(legalNoiseSource, 'i');
      const SURVEY_NAV_NOISE_RE = new RegExp(navigationNoiseSource, 'i');
      /**
       * Chỉ xét control hiển thị thuộc form hoặc khảo sát đang xử lý.
       * @param {Element} el Phần tử cần kiểm tra.
       * @return {boolean} Phần tử hợp lệ trong phạm vi hiện tại.
       * @author ductv <ductv@getflycrm.com>
       * @since 2026-11-11
       */
      const isVisible = el => {
        if (scopeSelector && !el?.matches(scopeSelector)) return false;
        if (!el || el.disabled || el.closest('[data-ux-semantic-owned="1"]')) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
        if (el.closest('[aria-hidden="true"], [inert], .inactive, .hidden, .hide, .step:not(.active):not(.current):not(.is-active):not([class*="active"]), .tab-pane:not(.active):not(.is-active)')) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        return true;
      };
      const rawCandidates = Array.from(document.querySelectorAll(['[id="btn-option"]', '[id^="btn-option"]', '[id*="btn-option"]', '[id*="btn_option"]', '.btn-option', '.btn_option', '[class*="answer" i]', '[class*="option" i]', '[class*="choice" i]', '[class*="response" i]', '[id*="answer" i]', '[id*="option" i]', '[id*="choice" i]', '[id*="response" i]', '[class*="btn-yes" i]', '[class*="btn-no" i]', '[class*="yes-btn" i]', '[class*="no-btn" i]', '#ct-creative-submit-yes', '#ct-creative-submit-no', 'a[id^="ct-creative-submit-"]', 'button[id^="ct-creative-submit-"]', '.ct-creative-submit', '[data-mock-secondary-offer-action]', 'button.ai-submit-button', 'a.ai-submit-button', '[data-btn-option]', 'button.btn-option', 'a.btn-option',
      // Các thẻ <a> là link câu trả lời khảo sát / trắc nghiệm nhảy trang:
      'a.choice', 'a.choice-btn', 'a.option-btn', 'a.answer-btn', 'a.quiz-btn', 'a.creative-survey-answer', 'a[data-vector-answer="true"]', 'a[data-choice]', 'a[data-answer]', 'a[data-option]', 'a.primary-btn', 'a.offer-click-tracking-no-link',
      // Các thẻ <a> hoặc button nằm trong container câu hỏi khảo sát:
      '.choices a', '.answers a', '.options a', '.survey-question a', '.question a', '.choice-container a', '.options-container a', '.card-options a', '.options-grid a', '.quiz-step a', '.survey-step a', '.quiz-container a', '.survey-card a', '.options-list a', '.step-container a',
      // Các nút bấm & lựa chọn của LocoTomato Widget nhúng:
      '.loco-btn', '.loco-option', '.loco-choice', '[data-loco-option]', '[data-loco-choice]', '[data-loco-value]', 'button.loco-btn', 'a.loco-btn', '[data-loco-role="option"]', '[data-loco-role="choice"]', '[data-loco-action="next"]', '[data-loco-action="select"]', '.loco-widget button', '.loco-widget a', '.choices button:not([type="submit"])', '.answers button:not([type="submit"])', '.options button:not([type="submit"])', '.survey-question button:not([type="submit"])', '.question button:not([type="submit"])',
      // Alpha Intent / LaunchPotato Funnel câu hỏi trắc nghiệm & lựa chọn:
      '.question-answers > button:not([type="submit"]):not(.ai-submit-button)', '.question-answers button:not([type="submit"]):not(.ai-submit-button)', '.yes-no-button-container > button', '.offer-buttons > button:not([type="submit"]):not(.ai-submit-button)', '.make-buttons > button', '.model-buttons > button', '.year-buttons > button', '.ai-button-container--question button:not(.ai-submit-button)', 'button[data-testid*="answer"]', 'button[data-testid*="option"]',
      // Các loại quiz cards, survey cards, choice cards, option cards:
      '.choice-card', '.option-card', '.answer-card', '.quiz-card', '.survey-card', '.quiz-option', '.survey-option', '.answer-option', '.choice-option', '.selection-card', '.selection-button', '.selection-item', '.card-choice', '.card-option', '.pill-option', '.bubble-option', '[data-choice]', '[data-answer]', '[data-option]', '[data-response]', '[data-vector-answer="true"]', '[data-element-type="survey_answer"]', '[role="option"]', 'button.qualifier-option-button', '.creative-survey-answer', '[role="radio"]',
      // Các nút bấm con nằm BÊN TRONG container btn-option:
      '#btn-option button', '#btn-option a', '#btn-option [role="button"]', '#btn-option input[type="button"]', '#btn-option input[type="submit"]', '#btn-option > div', '#btn-option > li', '#btn-option label', '[id*="btn-option"] button', '[id*="btn-option"] a', '[id*="btn-option"] [role="button"]', '[id*="btn-option"] input', '[id*="btn-option"] > div', '[id*="btn-option"] > li', '[id*="btn-option"] label', '.btn-option button', '.btn-option a', '.btn-option [role="button"]', '.btn-option input', '.btn-option > div', '.btn-option > li', '.btn-option label', '[id*="btn_option"] button', '[id*="btn_option"] a', '.btn_option button', '.btn_option a',
      // Các nút trong choice-container hoặc options-container
      '.choice-container button:not([type="submit"])', '.choice-container a', '.choice-container [role="button"]', '.options-container button:not([type="submit"])', '.options-container a', '.options-container [role="button"]'].join(', ')));
      const isNoiseOption = el => {
        if (!el) return true;
        const text = (el.innerText || el.textContent || el.value || '').trim().toLowerCase();
        const href = (el.getAttribute ? el.getAttribute('href') : '') || '';
        const idAndClass = `${el.id || ''} ${el.className || ''}`.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
        const role = (el.getAttribute && el.getAttribute('role') || '').toLowerCase();
        // Nộp form và chuyển bước do submit pipeline phụ trách.
        if (el.matches('button,input') && el.type === 'submit' && el.form) return true;
        if (/^(continue|next|submit|finish|proceed|start|tiếp tục|gửi)(?:\s*[→»›!])?$/i.test(text)) return true;

        const isInteractive = /^(a|button|input|label)$/i.test(el.tagName || '') || ['button', 'option', 'radio'].includes(role) || el.tabIndex >= 0 || typeof el.onclick === 'function';
        if (!isInteractive && /(?:^|[\s_-])(text|title|description|icon|caption|heading|copy|label)(?:$|[\s_-])/.test(idAndClass)) return true;
        if (/(?:^|[\s_-])(container|wrapper|list|group|grid|section|step|widget|form|panel)(?:$|[\s_-])/.test(idAndClass)) return true;

        // 1. Kiểm tra nếu nằm trong container câu hỏi khảo sát / quiz / choices rõ ràng
        const inSurveyContainer = Boolean(el.closest && el.closest('.question, .survey-question, .choices, .answers, .options, .choice-container, .options-container, .quiz-step, .survey-step, [id*="btn-option"], .btn-option, .survey-card, .quiz-card, .quiz-container, .selection-card, .card-options, .options-grid, .loco-widget, .loco-card, .loco-step, .loco-question, .loco-form, [data-loco-widget], fieldset'));

        // 2. Pháp lý / điều khoản (privacy, terms...) — regex dùng chung tại survey-solver.mjs
        if (SURVEY_LEGAL_NOISE_RE.test(text) || !inSurveyContainer && (SURVEY_LEGAL_NOISE_RE.test(href) || SURVEY_LEGAL_NOISE_RE.test(idAndClass))) return true;

        // 3. Menu điều hướng: Chỉ kiểm tra trên text hiển thị của nút để tránh lọc nhầm link khảo sát dẫn tới /register hoặc /signup
        const navTextNoise = /^(sign\s*in|login|log\s*in|my\s*account|home|homepage|main\s*menu|menu|cart|shopping\s*cart|portal|contact\s*us|about\s*us|help\s*&\s*faq|faqs?)$/i;
        if (navTextNoise.test(text)) return true;
        if (!inSurveyContainer) {
          // Regex dùng chung tại survey-solver.mjs (SURVEY_NAV_NOISE_RE)
          if (SURVEY_NAV_NOISE_RE.test(text) || SURVEY_NAV_NOISE_RE.test(idAndClass)) return true;
        }
        if (href.startsWith('mailto:') || href.startsWith('tel:')) return true;
        if (/^(cancel|back|previous|prev|quay lại|hủy|bỏ qua)$/i.test(text)) return true;
        return false;
      };
      const uniqueElements = Array.from(new Set(rawCandidates));
      const allCandidates = uniqueElements.filter(el => {
        if (!isVisible(el)) return false;
        if (isNoiseOption(el)) return false;
        if (el.closest('.offerwall-card, form[data-tf-element-role="offer"], .offerwall-card-wrap')) return false;
        // Bỏ qua wrapper khi bên trong đã có một đáp án cụ thể hơn.
        const hasAnswerChild = uniqueElements.some(child => child !== el && el.contains(child) && !isNoiseOption(child));
        if (hasAnswerChild) return false;
        return true;
      });
      if (!allCandidates.length) return [];

      // Gom theo nhóm câu hỏi; nếu class lạ thì tìm tổ tiên gần nhất chứa từ hai đáp án.
      const groups = new Map();
      const now = Date.now();
      const questionGroupSelector = ['.question', '.survey-question', 'fieldset', '.choice-container', '.options-container', '.quiz-step', '.question-container', '.survey-step', '[role="radiogroup"]', '[role="group"]', '.choices', '.answers', '.quiz-container', '.survey-card', '.question-wrap', '.question-wrapper', '.quiz-question', '.survey-group', '.answers-container', '.poll-question', '.form-question', '.survey-block', '.step-content', '.survey-slide', '.answer-group', '.option-group', '.choice-group', '.answer-list', '.option-list', '.choice-list', '.response-group', '[class*="answers" i]', '[class*="options" i]', '[class*="choices" i]', '[data-question]', '[data-question-id]', '[id*="btn-option"]', '.btn-option'].join(', ');
      allCandidates.forEach((btn, idx) => {
        let answerGroupContainer = null;
        const knownQuestionGroup = btn.parentElement?.closest(questionGroupSelector);
        if (knownQuestionGroup && allCandidates.filter(candidate => knownQuestionGroup.contains(candidate)).length > 1) {
          answerGroupContainer = knownQuestionGroup;
        }
        if (!answerGroupContainer) {
          let answerGroupAncestor = btn.parentElement;
          while (answerGroupAncestor && answerGroupAncestor !== document.body) {
            if (allCandidates.filter(candidate => answerGroupAncestor.contains(candidate)).length > 1) {
              answerGroupContainer = answerGroupAncestor;
              break;
            }
            answerGroupAncestor = answerGroupAncestor.parentElement;
          }
        }
        answerGroupContainer ||= btn.parentElement || document.body;
        if (!groups.has(answerGroupContainer)) {
          groups.set(answerGroupContainer, []);
        }
        const uid = `btn_option_${idx}_${now}`;
        btn.setAttribute('data-ux-btn-option-id', uid);
        const isSelected = btn.classList.contains('active') || btn.classList.contains('selected') || btn.classList.contains('checked') || btn.classList.contains('chosen') || btn.getAttribute('aria-checked') === 'true' || btn.getAttribute('aria-selected') === 'true' || btn.getAttribute('aria-pressed') === 'true' || btn.getAttribute('data-ux-clicked') === '1' || btn.tagName === 'INPUT' && btn.checked || btn.querySelector('input:checked') !== null || (btn.id ? Boolean(document.querySelector(`input[id=${JSON.stringify(btn.id)}]:checked`)) : false);
        const lastClickedTime = Number(btn.getAttribute('data-ux-btn-clicked-time') || 0);
        const recentlyClicked = now - lastClickedTime < 5000;
        groups.get(answerGroupContainer).push({
          uid,
          id: btn.id || '',
          className: btn.className || '',
          text: (btn.innerText || btn.textContent || btn.value || '').trim(),
          isSelected,
          recentlyClicked
        });
      });
      const actionableGroups = [];
      for (const [container, items] of groups.entries()) {
        const hasRecentlyClicked = items.some(it => it.recentlyClicked);
        const hasSelected = items.some(it => it.isSelected);
        // QUAN TRỌNG: Chỉ chọn khi nhóm này CHƯA có đáp án nào được chọn (isSelected)
        // và CHƯA từng được click gần đây, tránh click đi click lại 1 nút mở nhiều link.
        // Cho phép cả nhóm nhiều đáp án (>1) và nút lựa chọn đơn chiếc Yes/No/CTA/tiếp tục.
        const isSingleChoiceBtn = items.length === 1 && (/^(yes|no|no thanks|agree|continue|claim|tiếp tục|đồng ý)$/i.test(items[0].text) || /yes|no|choice|answer|option|soi|submit/i.test(`${items[0].id} ${items[0].className}`));
        if (!hasRecentlyClicked && !hasSelected && (items.length > 1 || isSingleChoiceBtn)) {
          // Kèm tiêu đề câu hỏi để signature phân biệt được các bước Yes/No liên tiếp
          // trên cùng một URL (cùng câu hỏi rebuild DOM → chặn, câu khác → cho phép).
          const headingEl = container.querySelector('h1, h2, h3, h4, legend, .question-title, .main-question, p');
          const heading = (headingEl?.innerText || headingEl?.textContent || '' || '').trim();
          actionableGroups.push({
            source: 'btn_option',
            heading,
            items
          });
        }
      }
      return actionableGroups;
    }, { scopeSelector: frame._activeAutofillFormScope?.memberSelector, legalNoiseSource: SURVEY_LEGAL_NOISE_RE.source, navigationNoiseSource: SURVEY_NAV_NOISE_RE.source }).catch(() => []);
    for (const groupEntry of btnOptionGroups) {
      // Contract: mỗi entry là { source: 'btn_option', heading, items } trả về từ evaluate phía trên.
      // Dữ liệu không đúng shape (mock/trả lẫn từ khối khác) thì bỏ qua an toàn.
      if (groupEntry?.source !== 'btn_option') continue;
      const groupHeading = groupEntry.heading ?? '';
      const group = groupEntry.items;
      if (!Array.isArray(group) || !group.length) continue;
      // Signature dựa trên pagePath + câu hỏi + options: chặn re-click khi DOM bị
      // rebuild (attribute per-element "" mất theo DOM, chỉ chặn được 5s).
      const groupSignature = buildSurveyAnswerSignature(frame, groupHeading, group);
      if (isSurveyAnswerHandled(frame, groupSignature)) continue;
      // Chọn ngẫu nhiên 1 đáp án trong danh sách các btn-option
      const picked = group[Math.floor(Math.random() * group.length)];
      if (picked?.uid) {
        try {
          const locator = locateFormElements(frame, `[data-ux-btn-option-id="${picked.uid}"]`).first();
          if (locator && (await locator.count().catch(() => 0)) > 0) {
            if (typeof locator.scrollIntoViewIfNeeded === 'function') {
              await locator.scrollIntoViewIfNeeded({
                timeout: 400
              }).catch(() => {});
            }
            const activePage = typeof frame.page === 'function' ? frame.page() : null;
            const isRealBrowser = Boolean(activePage?.mouse && typeof activePage.mouse.move === 'function');
            if (isRealBrowser) {
              const readPause = Math.floor(Math.random() * 60) + 40;
              await new Promise(r => setTimeout(r, readPause));
              if (Math.random() < 0.15) {
                await naturalMouseDrift(activePage, 1);
              }
            }
            const answerResult = await performSurveyAnswer(frame, locator, answerOptions);
            if (!answerResult.dispatched || !answerResult.verified) continue;
            await locator.evaluate(element => element.setAttribute('data-ux-clicked', '1')).catch(() => {});
            answeredCount += 1;
            if (session) {
              session.lastActionTime = Date.now();
              addActionCount(session, 1);
              // Click đáp án KHÔNG được tính là submit — chỉ ghi pending; bộ đếm màn
              // (completedScreens) chỉ tăng khi trang THỰC SỰ chuyển sang màn khác.
              session.answerClickPending = true;
            }
            markSurveyAnswerHandled(frame, groupSignature);
            if (answerResult.advanced) return answeredCount;
          }
        } catch {}
      }
    }
  } catch {}

  // 1. Xử lý các nhóm radio buttons tiêu chuẩn (<input type="radio">)
  try {
    const radioGroups = await locateFormElements(frame, 'input[type="radio"]').evaluateAll(radios => {
      const groups = {};
      radios.forEach((r, idx) => {
        if (r.disabled || r.closest?.('[data-ux-semantic-owned="1"]')) return;
        if (typeof r.getBoundingClientRect === 'function') {
          const displayTarget = r.getBoundingClientRect().width > 0 && r.getBoundingClientRect().height > 0 ? r : Array.from(r.labels || []).find(label => label.getBoundingClientRect().width > 0 && label.getBoundingClientRect().height > 0);
          if (!displayTarget) return;
          let hidden = false;
          for (let ancestor = displayTarget; ancestor; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor);
            if (ancestor.hidden || ancestor.hasAttribute('inert') || style.display === 'none' || ['hidden','collapse'].includes(style.visibility) || style.opacity === '0') hidden = true;
          }
          if (hidden) return;
        }
        const groupKey = r.name || r.closest('fieldset, .form-group, .question, .form-row, div')?.getAttribute('id') || `unnamed_group_${idx}`;
        if (!groups[groupKey]) {
          groups[groupKey] = {
            hasChecked: false,
            items: []
          };
        }
        if (r.checked) groups[groupKey].hasChecked = true;
        const label = typeof r.closest === 'function' ? r.closest('label') : null;
        const doc = typeof document !== 'undefined' ? document : null;
        const labelFor = doc && r.id ? doc.querySelector(`label[for="${r.id}"]`) : null;
        const targetLabel = label || labelFor;
        const labelText = (targetLabel?.innerText || targetLabel?.textContent || '').trim();
        groups[groupKey].items.push({
          id: r.id || '',
          name: r.name || '',
          value: r.value || '',
          label: labelText,
          index: idx
        });
      });
      return groups;
    }).catch(() => ({}));
    for (const [groupKey, group] of Object.entries(radioGroups)) {
      if (group.hasChecked || !group.items.length) continue;

      // Ưu tiên nếu trong record có trường khớp
      let chosen = null;
      const normalizedKey = normalizeFieldName(groupKey);
      if (record && record[normalizedKey]) {
        const targetVal = String(record[normalizedKey]).toLowerCase();
        chosen = group.items.find(item => item.value.toLowerCase() === targetVal || item.label.toLowerCase() === targetVal || targetVal === 'yes' && /yes|co|true/i.test(`${item.value} ${item.label}`) || targetVal === 'no' && /no|khong|false/i.test(`${item.value} ${item.label}`));
      }

      // Nếu không khớp trong record, random lựa chọn số 1 hoặc số 2 (tránh spam trả lời giống nhau liên tục)
      if (!chosen) {
        const maxIdx = Math.min(2, group.items.length);
        chosen = group.items[Math.floor(Math.random() * maxIdx)];
      }
      try {
        let radioLocator = null;
        if (chosen.id) {
          radioLocator = locateFormElements(frame, `input[type="radio"][id=${JSON.stringify(chosen.id)}]`).first();
        } else if (chosen.name && chosen.value) {
          radioLocator = locateFormElements(frame, `input[type="radio"][name="${chosen.name}"][value="${chosen.value}"]`).first();
        } else {
          radioLocator = locateFormElements(frame, 'input[type="radio"]').nth(chosen.index);
        }
        if (radioLocator && (await radioLocator.count()) > 0) {
          if (typeof radioLocator.scrollIntoViewIfNeeded === 'function') {
            await radioLocator.scrollIntoViewIfNeeded({
              timeout: 400
            }).catch(() => {});
          }
          const radioPause = Math.floor(Math.random() * 50) + 40;
          await new Promise(r => setTimeout(r, radioPause));
          const answerResult = await performSurveyAnswer(frame, radioLocator, answerOptions);
          if (!answerResult.dispatched || !answerResult.verified) continue;
          answeredCount += 1;
          if (session) {
            session.lastActionTime = Date.now();
            session.answerClickPending = true;
            addActionCount(session, 1);
          }
          if (answerResult.advanced) return answeredCount;
        }
      } catch {}
    }
  } catch {}

  // 2. Xử lý các câu hỏi khảo sát / lựa chọn dạng button / thẻ <a> (Vector Survey, Creative, Age options, Yes/No)
  try {
    const questionChoiceGroups = await frame.evaluate(scopeSelector => {
      const results = [];
      const optionSelector = ['[id="btn-option"]', '[id^="btn-option"]', '[id*="btn-option"]', '.btn-option', 'button.btn-option', 'a.btn-option', 'a.choice', 'a.choice-btn', 'a.option-btn', 'a.answer-btn', 'a.quiz-btn', 'a.creative-survey-answer', 'a[data-vector-answer="true"]', 'a[data-choice]', 'a[data-answer]', 'a[data-option]', 'button[data-vector-answer="true"]', 'button[data-element-type="survey_answer"]', 'button[name="selected_answer"]', 'button[name="survey_answer"]', 'button[data-action="answer_survey"]', 'button.qualifier-option-button', '.creative-survey-answer', 'a.primary-btn', 'a.offer-click-tracking-no-link', 'button.question-answer-button:not(.submit-button):not(.ai-submit-button):not([id="submit-button"]):not([data-tf-element-role="submit"])', 'button[id^="answer-"]:not(.submit-button):not(.ai-submit-button):not([id="submit-button"]):not([data-tf-element-role="submit"])', '.question-answer-cta-text:not(.submit-button):not(.ai-submit-button):not([id="submit-button"]):not([data-tf-element-role="submit"])', '.ai-button--question:not(.ai-submit-button):not(.submit-button):not([id="submit-button"]):not([data-tf-element-role="submit"])', 'button[name="question-answer"]:not(.submit-button):not(.ai-submit-button):not([id="submit-button"]):not([data-tf-element-role="submit"])', '.question-answers button:not(.ai-submit-button):not(.submit-button):not([id="submit-button"]):not([data-tf-element-role="submit"])', 'button[data-answer-id]:not(.submit-button):not(.ai-submit-button):not([id="submit-button"]):not([data-tf-element-role="submit"])', '.ai-button-content-text:not(.submit-button):not(.ai-submit-button):not([id="submit-button"]):not([data-tf-element-role="submit"])', '.answer-button:not(.submit-button):not(.ai-submit-button):not(.offerwall-btn)', '.survey-answer:not(.submit-button):not(.ai-submit-button):not(.offerwall-btn)', '.option-button:not(.submit-button):not(.ai-submit-button):not(.offerwall-btn)', 'div[role="button"][data-answer]:not(.offerwall-btn)', 'div[role="button"][data-option]:not(.offerwall-btn)', 'button:not([type="submit"]):not(.btn-submit):not(.submit-button):not(.ai-submit-button):not([id="submit-button"]):not([data-tf-element-role="submit"]):not(.faq-trigger):not(.offerwall-btn)', '[role="radio"]', '[role="button"]:not(.btn-submit):not(.submit-button):not(.ai-submit-button):not([id="submit-button"]):not([data-tf-element-role="submit"]):not(.offerwall-btn)', '.option-btn, .choice-btn, .quiz-btn, .answer-btn, label.btn', '.options-container a', '.choice-container a', '.choices a', '.answers a', '.options a', 'a.option', '.option', 'a[data-next]', '[data-next]', '.survey-question a', '.question a', 'button.loco-btn', 'a.loco-btn', '.loco-btn', '.loco-option', '.loco-choice', '[data-loco-option]', '[data-loco-value]'].join(', ');
      /**
       * Chỉ xét control hiển thị thuộc form hoặc khảo sát đang xử lý.
       * @param {Element} el Phần tử cần kiểm tra.
       * @return {boolean} Phần tử hợp lệ trong phạm vi hiện tại.
       * @author ductv <ductv@getflycrm.com>
       * @since 2026-11-11
       */
      const isVisible = el => {
        if (scopeSelector && !el?.matches(scopeSelector)) return false;
        if (!el || el.closest('[data-ux-semantic-owned="1"]')) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        return Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      };
      const containerSelector = ['.options-container', '.card-options', '.choice-container', '.options', 'section.screen.is-active', '.screen.is-active', '.options-grid', 'div[role="radiogroup"]', '.choices', '.survey-question', '.options-list', 'fieldset', '[data-element-type="survey_question"]', '.question', '.creative', '.quiz-step', '.survey-step', '.step-container', '.creative-survey', '.survey-form', '.quiz-container', '.survey-card', '.questions-container', '.loco-widget', '.loco-card', '.loco-step', '.loco-question', '.loco-form', '[data-loco-widget]', '.ai-content--question', '.question-object', '.question-answers', '#question-answers', '[data-object-type="question"]', '.ai-button-container--question', '.ai-button-container', '.yes-no-answers', '.multi-select', '.ai-button-container--multiselect'].join(', ');
      const containers = Array.from(document.querySelectorAll(containerSelector)).filter(element => !scopeSelector || element.matches(scopeSelector));
      containers.forEach((container, groupIndex) => {
        if (!isVisible(container)) return;

        // Bỏ qua container cha nếu nó bao bọc một container con khác để tránh bắt nhầm toàn bộ page
        const hasChildContainer = containers.some(other => other !== container && container.contains(other));
        if (hasChildContainer) return;

        // Bỏ qua nếu bên trong chứa các input thông thường cần điền (tránh nhầm với form điền)
        if (container.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])')) return;

        // Bỏ qua nếu thuộc Offerwall Card
        if (container.closest('.offerwall-card, form[data-tf-element-role="offer"], .offerwall-card-wrap')) return;
        const candidateOptions = Array.from(container.querySelectorAll(optionSelector)).filter(isVisible);
        if (candidateOptions.length < 2) return;

        // Kiểm tra xem đã có nút nào ĐANG HIỂN THỊ trong container này được click hoặc đang active
        const alreadyActive = candidateOptions.some(b => b.classList.contains('active') || b.classList.contains('selected') || b.getAttribute('aria-checked') === 'true' || ['aria-checked', 'aria-selected', 'aria-pressed'].some(attribute => b.getAttribute(attribute) === 'true') || b.getAttribute('data-ux-clicked') === '1');
        if (alreadyActive) return;
        const titleEl = container.querySelector('h1, h2, h3, h4, .main-question, .survey-label, .creative-survey-question, legend, .question-title, p') || container.closest('.question-object, .ai-content--question, [data-object-type="question"], .mock-offer-page')?.querySelector('h1, h2, h3, h4, .question-title, .ai-headline--question, legend, p') || container.parentElement?.querySelector('h1, h2, h3, h4, .question-title, .ai-headline--question, legend, p');
        const questionTitle = (titleEl?.innerText || titleEl?.textContent || '').trim();
        const items = [];
        candidateOptions.forEach((btn, optIndex) => {
          const uid = `choice_${groupIndex}_${optIndex}_${Date.now()}`;
          btn.setAttribute('data-ux-choice-id', uid);
          const rawText = (btn.querySelector('.option__label')?.textContent || btn.innerText || btn.textContent || btn.querySelector('[data-value]')?.getAttribute('data-value') || btn.querySelector('.question-answer-cta-span, .ai-button-text, .button-text')?.textContent || btn.value || '').trim();
          const rawVal = btn.getAttribute('data-value') || btn.querySelector('[data-value]')?.getAttribute('data-value') || btn.getAttribute('data-vector-field-value') || btn.getAttribute('value') || btn.getAttribute('data-option-id') || btn.getAttribute('data-answer-id') || btn.querySelector('[data-answer-id]')?.getAttribute('data-answer-id') || '';
          items.push({
            uid,
            id: btn.id || '',
            text: rawText,
            value: rawVal,
            field: btn.getAttribute('data-vector-field') || btn.getAttribute('data-field') || '',
            tagName: btn.tagName.toLowerCase(),
            href: btn.getAttribute('href') || ''
          });
        });
        if (items.length >= 2) {
          results.push({
            questionTitle,
            items
          });
        }
      });

      // Fallback: Nếu không tìm thấy trong container, tìm các cụm nút Yes/No hoặc Survey standalone
      if (!results.length) {
        const standaloneVectorButtons = Array.from(document.querySelectorAll('[id="btn-option"], [id^="btn-option"], [id*="btn-option"], .btn-option, button[data-vector-answer="true"], button.btn-option, button[name="selected_answer"], button[name="survey_answer"], button.creative-survey-answer, button[data-action="answer_survey"], button.qualifier-option-button')).filter(isVisible);
        if (standaloneVectorButtons.length >= 2) {
          const alreadyActive = standaloneVectorButtons.some(b => b.classList.contains('active') || b.classList.contains('selected') || ['aria-checked', 'aria-selected', 'aria-pressed'].some(attribute => b.getAttribute(attribute) === 'true') || b.getAttribute('data-ux-clicked') === '1');
          if (!alreadyActive) {
            const heading = (document.querySelector('h1, h2, h3, h4, .main-question, .survey-question-text, .question, legend')?.innerText || 'vector_survey').trim();
            results.push({
              questionTitle: heading,
              items: standaloneVectorButtons.map((btn, optIndex) => {
                const uid = `choice_vec_${optIndex}_${Date.now()}`;
                btn.setAttribute('data-ux-choice-id', uid);
                return {
                  uid,
                  id: btn.id || '',
                  text: (btn.innerText || btn.textContent || btn.value || '').trim(),
                  value: btn.getAttribute('data-vector-field-value') || btn.getAttribute('value') || '',
                  field: btn.getAttribute('data-vector-field') || btn.getAttribute('name') || '',
                  tagName: btn.tagName.toLowerCase()
                };
              })
            });
          }
        }
      }
      if (!results.length) {
        const allButtons = Array.from(document.querySelectorAll('button:not([type="submit"]):not(.btn-submit):not(.faq-trigger):not(.offerwall-btn), [role="button"]:not(.btn-submit):not(.offerwall-btn)')).filter(isVisible);
        const yesBtn = allButtons.find(b => /^(yes|có|true|agree)$/i.test((b.innerText || b.textContent || '').trim()));
        const noBtn = allButtons.find(b => /^(no|không|false|disagree)$/i.test((b.innerText || b.textContent || '').trim()));
        if (yesBtn && noBtn) {
          const isYesActive = yesBtn.classList.contains('active') || yesBtn.classList.contains('selected') || ['aria-checked', 'aria-selected', 'aria-pressed'].some(attribute => yesBtn.getAttribute(attribute) === 'true') || yesBtn.getAttribute('data-ux-clicked') === '1';
          const isNoActive = noBtn.classList.contains('active') || noBtn.classList.contains('selected') || ['aria-checked', 'aria-selected', 'aria-pressed'].some(attribute => noBtn.getAttribute(attribute) === 'true') || noBtn.getAttribute('data-ux-clicked') === '1';
          if (!isYesActive && !isNoActive) {
            const uidYes = `choice_yes_${Date.now()}`;
            const uidNo = `choice_no_${Date.now()}`;
            yesBtn.setAttribute('data-ux-choice-id', uidYes);
            noBtn.setAttribute('data-ux-choice-id', uidNo);
            results.push({
              questionTitle: 'yes_no',
              items: [{
                uid: uidYes,
                id: yesBtn.id || '',
                text: (yesBtn.innerText || yesBtn.textContent || '').trim(),
                value: 'yes',
                tagName: yesBtn.tagName.toLowerCase()
              }, {
                uid: uidNo,
                id: noBtn.id || '',
                text: (noBtn.innerText || noBtn.textContent || '').trim(),
                value: 'no',
                tagName: noBtn.tagName.toLowerCase()
              }]
            });
          }
        }
      }

      // Fallback KHÔNG-FORM: cụm đáp án lân cận theo DOM proximity.
      // Form offer không bao giờ cố định — khi không có container chuẩn nào khớp,
      // gom các nút/link/text có hành vi đáp án (text ngắn, lân cận nhau, không phải
      // noise/nav/submit) theo tổ tiên chung chứa >= 2 phần tử. Không yêu cầu form,
      // không yêu cầu class nhất định.
      if (!results.length) {
        const proximityNoise = /privacy|terms|policy|\bcookie|copyright|disclaimer|sign\s*in|log\s*in|\blogin\b|\bregister\b|unsubscribe|contact\s*us|about\s*us|\bhelp\b|\bfaq|\bmenu\b|\bcart\b|portal|my\s*account|do\s*not\s*sell|opt[- ]?out/i;
        const forwardNavText = /^(?:next|continue|submit|finish|proceed|back|previous|prev|cancel|skip|done|ok|quay\s*lại|bỏ\s*qua|hủy|tiếp)/i;
        const isInteractive = el => /^(a|button|input|label|li|div|span)$/i.test(el.tagName || '') ? el.tagName === 'A' || el.tagName === 'BUTTON' || el.tabIndex >= 0 || typeof el.onclick === 'function' || el.getAttribute && (el.getAttribute('role') === 'button' || el.getAttribute('role') === 'radio' || el.getAttribute('role') === 'option') || ['input', 'button', 'anchor', 'item', 'option', 'choice', 'answer', 'btn', 'radio'].some(k => String(el.className || '').toLowerCase().includes(k)) : false;
        const proximityCandidates = Array.from(document.querySelectorAll('button:not([type="submit"]), a[href], [role="radio"], [role="option"], [role="button"], [data-ux-choice-id]')).filter(el => {
          if (!isVisible(el)) return false;
          const text = (el.innerText || el.textContent || el.value || '').trim();
          if (!text || text.length > 60) return false;
          if (forwardNavText.test(text) || proximityNoise.test(text)) return false;
          const href = (el.getAttribute ? el.getAttribute('href') : '') || '';
          if (href && (href.startsWith('mailto:') || href.startsWith('tel:'))) return false;
          if (!isInteractive(el)) return false;
          // Bỏ qua nút nằm trong input-field form điền (tránh nhầm nút "Check" của ô nhập)
          const holder = el.closest('form, fieldset, .form-group, .form-row, [data-tf-element-role="offer"], .offerwall-card');
          if (holder && holder.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea')) return false;
          return true;
        });

        // Gom theo tổ tiên chung gần nhất chứa >= 2 candidate (không cần form)
        const proximityClusters = [];
        const seenClusterRoots = new Set();
        for (const el of proximityCandidates) {
          let clusterRoot = null;
          let ancestor = el.parentElement;
          while (ancestor && ancestor !== document.body) {
            const inside = proximityCandidates.filter(other => ancestor.contains(other));
            if (inside.length >= 2) {
              clusterRoot = ancestor;
            }
            ancestor = ancestor.parentElement;
          }
          if (!clusterRoot || seenClusterRoots.has(clusterRoot)) continue;
          seenClusterRoots.add(clusterRoot);
          // Đánh dấu handled nếu cụm này đã có nút được click trước đó
          const alreadyActive = proximityCandidates.filter(c => clusterRoot.contains(c)).some(c => c.classList.contains('active') || c.classList.contains('selected') || c.getAttribute('aria-checked') === 'true' || ['aria-checked', 'aria-selected', 'aria-pressed'].some(attribute => c.getAttribute(attribute) === 'true') || c.getAttribute('data-ux-clicked') === '1');
          if (alreadyActive) continue;
          // Bỏ qua cụm chứa input điền tự do (trường hợp form thiếu class nhưng có ô nhập)
          if (clusterRoot.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]), textarea, select')) continue;
          const headingEl = clusterRoot.querySelector('h1, h2, h3, h4, legend, .question-title, .main-question, p');
          const questionTitle = (headingEl?.innerText || headingEl?.textContent || '' || 'proximity_options').trim();
          const items = [];
          proximityCandidates.filter(c => clusterRoot.contains(c)).forEach((btn, optIndex) => {
            const uid = `choice_prox_${optIndex}_${Date.now()}`;
            btn.setAttribute('data-ux-choice-id', uid);
            items.push({
              uid,
              id: btn.id || '',
              text: (btn.innerText || btn.textContent || btn.value || '').trim(),
              value: btn.getAttribute('data-value') || btn.getAttribute('value') || '',
              field: '',
              tagName: btn.tagName.toLowerCase(),
              href: btn.getAttribute('href') || ''
            });
          });
          if (items.length >= 2 && items.length <= 12) {
            proximityClusters.push({
              questionTitle,
              items
            });
          }
          if (proximityClusters.length >= 4) break;
        }
        results.push(...proximityClusters);
      }

      // Fallback: Tìm các nhóm radio buttons HTML (<input type="radio">) chưa có lựa chọn nào được chọn
      const radioGroups = {};
      const allRadios = Array.from(document.querySelectorAll('input[type="radio"]')).filter(r => {
        if (scopeSelector && !r.matches(scopeSelector)) return false;
        if (r.disabled) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(r) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
          const parent = r.closest('label, div, li');
          if (!parent) return false;
          const pStyle = window.getComputedStyle(parent);
          if (pStyle.display === 'none' || pStyle.visibility === 'hidden') return false;
          return Boolean(parent.offsetWidth || parent.offsetHeight || parent.getClientRects().length);
        }
        return Boolean(r.offsetWidth || r.offsetHeight || r.getClientRects().length);
      });
      allRadios.forEach(r => {
        const name = r.name || r.id || 'unnamed_radio_group';
        if (!radioGroups[name]) radioGroups[name] = [];
        radioGroups[name].push(r);
      });
      for (const [groupName, radios] of Object.entries(radioGroups)) {
        const hasChecked = radios.some(r => r.checked || r.getAttribute('data-ux-clicked') === '1');
        if (hasChecked || radios.length < 2) continue;
        const container = radios[0].closest('fieldset, .form-group, .step-container, .survey-question, form, div');
        const titleEl = container?.querySelector('legend, h1, h2, h3, h4, label, p, .question-title');
        const questionTitle = (titleEl?.innerText || titleEl?.textContent || groupName).trim();
        const items = radios.map((r, optIndex) => {
          const uid = `choice_radio_${groupName}_${optIndex}_${Date.now()}`;
          r.setAttribute('data-ux-choice-id', uid);
          const lbl = document.querySelector(`label[for="${r.id}"]`) || r.closest('label');
          const text = (lbl?.innerText || lbl?.textContent || r.value || '').trim();
          return {
            uid,
            id: r.id || '',
            text,
            value: r.value || '',
            field: groupName,
            tagName: 'input',
            isRadio: true
          };
        });
        results.push({
          questionTitle,
          items
        });
      }
      return results;
    }, frame._activeAutofillFormScope?.memberSelector).catch(() => []);
    for (const group of questionChoiceGroups) {
      if (!group.items || !group.items.length) continue;
      let picked = null;
      const titleLower = (group.questionTitle || '').toLowerCase();

      // A. Nếu là câu hỏi tuổi: ưu tiên khớp tuổi từ record nếu có
      // Heuristic theo items CHỈ chấp nhận khi TẤT CẢ các lựa chọn đều trông như
      // khoảng tuổi thật (8-130). Trước đây regex chấm chọn "1-3", "$50,000-$60,000"
      // làm câu hỏi tuổi → câu income/hours chọn theo tuổi không liên quan.
      const looksAgeRange = text => {
        const rangeMatch = String(text || '').match(/(\d+)\s*[-–]\s*(\d+)/);
        if (rangeMatch) {
          const low = Number(rangeMatch[1]);
          const high = Number(rangeMatch[2]);
          return low >= 8 && low < 100 && high > low && high <= 130;
        }
        const plusMatch = String(text || '').match(/^(?:over\s+)?(\d+)\s*\+?$/i);
        if (plusMatch) {
          const value = Number(plusMatch[1]);
          return value >= 8 && value <= 130;
        }
        return false;
      };
      const isAgeQuestion = /age|tuổi|how old|năm sinh|year of birth/i.test(titleLower) || group.items.length >= 2 && group.items.every(it => looksAgeRange(it.text));
      if (isAgeQuestion) {
        const userAge = calculateAge(record);
        if (typeof userAge === 'number') {
          picked = group.items.find(it => matchAgeRange(it.text, userAge));
        }
      }

      // B. Nếu là câu hỏi Nhà ở (Rent vs Own / Living situation): ưu tiên đối chiếu record nếu có
      if (!picked && (/own or rent|homeowner|housing|living situation|nhà ở/i.test(titleLower) || group.items.some(it => /rent|own/i.test(it.value)))) {
        const homeVal = String(record?.homeowner || record?.housing || record?.living || '').toLowerCase();
        if (homeVal.includes('own')) {
          picked = group.items.find(it => /own/i.test(`${it.value} ${it.text}`));
        } else if (homeVal.includes('rent')) {
          picked = group.items.find(it => /rent/i.test(`${it.value} ${it.text}`));
        }
        if (!picked) {
          picked = group.items.find(it => /homeowner|own/i.test(`${it.value} ${it.text}`)) || group.items.find(it => /renter|rent/i.test(`${it.value} ${it.text}`)) || group.items[0];
        }
      }

      // C. Nếu là câu hỏi CAPTCHA động vật (huấn luyện từ log thực tế)
      if (!picked && /animal.*big|big.*animal|largest/i.test(titleLower)) {
        picked = group.items.find(it => /elephant|whale|bear|lion|dog|horse/i.test(`${it.value} ${it.text}`));
      } else if (!picked && /animal.*small|small.*animal|smallest/i.test(titleLower)) {
        picked = group.items.find(it => /ant|mouse|bird|cat|bee/i.test(`${it.value} ${it.text}`));
      }

      // D. Nếu là câu hỏi khảo sát phổ biến trong log: nợ thẻ, nợ thuế, hoàn thuế, ngân hàng, vay vốn, quân đội, duyệt web, thu nhập, con cái
      if (!picked && /tax debt/i.test(titleLower)) {
        picked = group.items.find(it => /no|không/i.test(it.text)) || group.items[0];
      } else if (!picked && /tax refund/i.test(titleLower)) {
        picked = group.items.find(it => /^(yes|có)$/i.test(it.text)) || group.items[0];
      } else if (!picked && /bank account|ngân hàng/i.test(titleLower)) {
        picked = group.items.find(it => /^(yes|có)$/i.test(it.text)) || group.items[0];
      } else if (!picked && /personal loan|loan\b|khoản vay/i.test(titleLower)) {
        picked = group.items.find(it => /^(yes|có|maybe)$/i.test(it.text)) || group.items[0];
      } else if (!picked && /veteran|active duty|military|quân đội/i.test(titleLower)) {
        picked = group.items.find(it => /^(no|không)$/i.test(it.text)) || group.items.find(it => /^(yes|có)$/i.test(it.text)) || group.items[0];
      } else if (!picked && /debt|credit card/i.test(titleLower)) {
        picked = group.items.find(it => /10,000|20,000|5,000/i.test(it.text)) || group.items[0];
      } else if (!picked && /browse|online.*day|hours/i.test(titleLower)) {
        picked = group.items.find(it => /1-3 hours|4-6 hours|less than/i.test(it.text)) || group.items[0];
      } else if (!picked && /income|salary|earn|thu nhập/i.test(titleLower)) {
        picked = group.items.find(it => /50,000|75,000|40,000|30,000/i.test(it.text)) || group.items[0];
      } else if (!picked && /children|kids|child|con cái/i.test(titleLower)) {
        picked = group.items.find(it => /no kids|không có/i.test(it.text)) || group.items[0];
      } else if (!picked && group.items.some(it => /^(yes|có)$/i.test(it.text))) {
        picked = group.items.find(it => /^(yes|có)$/i.test(it.text));
      }

      // E. Nếu không khớp tiêu chí riêng: random lựa chọn số 1 hoặc số 2 (tránh spam trả lời giống nhau liên tục),
      // bỏ qua nút none/cancel/back nếu có lựa chọn khác.
      if (!picked) {
        const pool = group.items.filter(it => !/none of the above|cancel|back|previous|bỏ qua/i.test(it.text));
        const candidateList = pool.length > 0 ? pool : group.items;
        const maxIdx = Math.min(2, candidateList.length);
        picked = candidateList[Math.floor(Math.random() * maxIdx)];
      }
      if (picked?.uid) {
        try {
          const locator = locateFormElements(frame, `[data-ux-choice-id="${picked.uid}"]`).first();
          if (locator && (await locator.count()) > 0) {
            const answerSignature = buildSurveyAnswerSignature(frame, group.questionTitle, group.items);
            // Chỉ KIỂM TRA (không ghi nhận trước) — signature mới được ghi nhận
            // sau khi click thành công để click hỏng vẫn được thử lại vòng sau.
            if (isSurveyAnswerHandled(frame, answerSignature)) continue;
            if (typeof locator.scrollIntoViewIfNeeded === 'function') {
              await locator.scrollIntoViewIfNeeded({
                timeout: 400
              }).catch(() => {});
            }
            if (typeof locator.hover === 'function') {
              await locator.hover({
                timeout: 400
              }).catch(() => {});
            }
            const surveyPause = Math.floor(Math.random() * 50) + 50;
            await new Promise(r => setTimeout(r, surveyPause));
            const answerResult = await performSurveyAnswer(frame, locator, answerOptions);
            if (!answerResult.dispatched || !answerResult.verified) continue;
            await locator.evaluate(element => element.setAttribute('data-ux-clicked', '1')).catch(() => {});
            answeredCount += 1;
            if (session) {
              session.lastActionTime = Date.now();
              addActionCount(session, 1);
              // Click đáp án KHÔNG phải submit — nếu trang thật sự chuyển màn,
              // bộ đếm completedScreens sẽ đếm qua bộ cờ answerClickPending.
              session.answerClickPending = true;
            }
            markSurveyAnswerHandled(frame, answerSignature);
            if (answerResult.advanced) return answeredCount;
          }
        } catch {}
      }
    }


  } catch {}
  return answeredCount;
}
export { handleRadioAndSurveyOptions };
