import { globalAiConfig } from './state/global-ai-config.mjs';

/**
 * Phát hiện action cứu hộ tự động trên trang khi AI trả về [] hoặc từ chối thực hiện.
 * Quét theo thứ tự ưu tiên:
 * 1. Câu hỏi trắc nghiệm logic / bot-detection (chó sủa "Woof", mèo kêu "Meow", phép tính, v.v.)
 * 2. Nút câu hỏi khảo sát / quiz buttons (btn-option, choice-btn, option-btn)
 * 3. Nút nhận thưởng Jump Page (.cta-button, .rjp-cta-button, /next)
 * 4. Nút bấm tiếp tục / submit (button[type="submit"], button.continue-btn, #btnNext, #btnSubmit)
 *
 * @param {object} page Playwright page.
 * @param {object} [config=null] Cấu hình AI tuỳ biến.
 * @return {Promise<{action:string,selector:string,detail?:string}|null>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function detectSmartFallbackAction(page, config = null) {
  const cfg = config || globalAiConfig;
  try {
    if (!page || typeof page.isClosed === 'function' && page.isClosed()) return null;
    const targetFrame = page._activeAutofillFrame || page;
    return await targetFrame.evaluate(opts => {
      const isVisible = el => {
        if (!el || el.disabled || opts.formScope && !el.matches(opts.formScope.memberSelector)) return false;
        if (el.closest('[aria-disabled="true"], [aria-busy="true"], [inert]')) return false;
        for (let ancestor = el; ancestor; ancestor = ancestor.parentElement) {
          const ancestorStyle = getComputedStyle(ancestor);
          if (ancestor.hidden || ancestorStyle.display === 'none' || ['hidden', 'collapse'].includes(ancestorStyle.visibility) || ancestorStyle.opacity === '0') return false;
        }
        const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
        return Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      };

      // 1. Câu hỏi trắc nghiệm / bot verification (ví dụ "What sound does a dog make?")
      if (opts.solveBotQuiz !== false) {
        const botButtons = Array.from(document.querySelectorAll('.bot-detection-answer-list button, button[name="selected_answer"], [data-element-type="survey_answer"] button')).filter(isVisible);
        if (botButtons.length > 0) {
          const pageText = (document.body.innerText || '').toLowerCase();
          let targetBtn = null;
          if (/dog|puppy|chó/i.test(pageText)) {
            targetBtn = botButtons.find(b => /woof|bark|gâu/i.test((b.value || b.innerText || '').toLowerCase()));
          } else if (/cat|kitten|mèo/i.test(pageText)) {
            targetBtn = botButtons.find(b => /meow|purr|meo/i.test((b.value || b.innerText || '').toLowerCase()));
          } else if (/cow|cattle|bò/i.test(pageText)) {
            targetBtn = botButtons.find(b => /moo/i.test((b.value || b.innerText || '').toLowerCase()));
          } else if (/duck|vịt/i.test(pageText)) {
            targetBtn = botButtons.find(b => /quack/i.test((b.value || b.innerText || '').toLowerCase()));
          }
          if (!targetBtn) {
            targetBtn = botButtons[Math.floor(Math.random() * botButtons.length)];
          }
          if (targetBtn) {
            const val = targetBtn.value || (targetBtn.innerText || '').trim();
            const selector = targetBtn.name ? `button[name="${targetBtn.name}"][value="${val}"]` : targetBtn.id ? `#${targetBtn.id}` : '.bot-detection-answer-list button';
            return {
              action: 'click',
              selector,
              detail: `Tự động trả lời câu hỏi trắc nghiệm: "${val}"`
            };
          }
        }
      }

      // 2. Câu hỏi khảo sát / quiz buttons / link thẻ a phương án trả lời (btn-option, choice-btn, option-btn, quiz-cards, pills)
      if (opts.solveSurveyCards !== false && opts.pickRandom !== false) {
        const surveyOptions = Array.from(document.querySelectorAll(['button[id^="answer-"]', 'button.question-answer-button', '[id="btn-option"]:not(.active):not(.selected)', '[id^="btn-option"]:not(.active):not(.selected)', '[id*="btn-option"]:not(.active):not(.selected)', '.btn-option:not(.active):not(.selected)', 'div.btn-option:not(.active):not(.selected)', 'div.button:not(.active):not(.selected)', 'div.btn:not(.active):not(.selected)', 'a.btn-option:not(.active):not(.selected)', 'a.choice:not(.active):not(.selected)', 'a.choice-btn:not(.active):not(.selected)', 'a.option-btn:not(.active):not(.selected)', 'a.answer-btn:not(.active):not(.selected)', 'a.quiz-btn:not(.active):not(.selected)', '.choices a:not(.active)', '.answers a:not(.active)', '.options a:not(.active)', '.options-container a:not(.active)', '.choice-container a:not(.active)', '[data-vector-answer="true"]:not(.active):not(.selected)', '.choice-btn:not(.active):not(.selected)', '.option-btn:not(.active):not(.selected)', '.quiz-btn:not(.active):not(.selected)', '.answer-btn:not(.active):not(.selected)', '.creative-survey-answer:not(.selected)', '.choice-card:not(.active):not(.selected)', '.option-card:not(.active):not(.selected)', '.quiz-card:not(.active):not(.selected)', '.survey-card:not(.active):not(.selected)', '.selection-card:not(.active):not(.selected)', '.pill-option:not(.active):not(.selected)', '.bubble-option:not(.active):not(.selected)', '[data-choice]:not(.active):not(.selected)', '[role="radio"]:not([aria-checked="true"])', 'div[class*="button" i]:not(.active):not(.selected)', 'div[class*="btn-option" i]:not(.active):not(.selected)', '#ct-creative-submit-yes', '#ct-creative-submit-no', 'a[id^="ct-creative-submit-"]', 'button[id^="ct-creative-submit-"]', '.ct-creative-submit', '[data-mock-secondary-offer-action]', 'button.btn-yes', 'button.btn-no', 'a.btn-yes', 'a.btn-no', '.yes-btn', '.no-btn', 'button.ai-submit-button', 'a.ai-submit-button'].join(', '))).filter(el => isVisible(el) && !el.closest('form[role="search"], form:has(input[type="search"][name="q"])') && el.matches('button, a, [role="button"], [role="radio"]'));
        if (surveyOptions.length > 0) {
          const randomOpt = surveyOptions[Math.floor(Math.random() * surveyOptions.length)];
          document.querySelectorAll('[data-ux-ai-fallback-choice="1"]').forEach(el => el.removeAttribute('data-ux-ai-fallback-choice'));
          randomOpt.setAttribute('data-ux-ai-fallback-choice', '1');
          const sel = '[data-ux-ai-fallback-choice="1"]';
          return {
            action: 'click',
            selector: sel,
            detail: 'Tự động chọn ngẫu nhiên phương án khảo sát / choice card'
          };
        }
      }

      // 2.5. Các ô Checkbox chưa tích (Đặc biệt là checkbox điều khoản, consent, survey options, hoặc required)
      const uncheckedBoxes = Array.from(document.querySelectorAll(['input[type="checkbox"]:not(:checked)', '[role="checkbox"]:not([aria-checked="true"])', '.custom-checkbox:not(.checked):not(.active)', '.checkbox-card:not(.checked):not(.active)', 'label.checkbox:not(.checked):not(.active)'].join(', '))).filter(el => {
        if (el.disabled || opts.formScope && !el.matches(opts.formScope.memberSelector)) return false;
        const group = el.closest('.twy-customquestion, .question, .survey-question, fieldset, .checkbox-group, .choices, .answers');
        if (group && group.querySelector('input[type="checkbox"]:checked, [role="checkbox"][aria-checked="true"]') && !el.required) return false;
        const parent = el.closest('label, div, li, .form-check, .checkbox') || el;
        if (!isVisible(parent)) return false;
        return Boolean(parent.offsetWidth || parent.offsetHeight || parent.getClientRects().length);
      });
      if (uncheckedBoxes.length > 0) {
        // Ưu tiên ô điều khoản/consent/required
        const consentBox = uncheckedBoxes.find(el => {
          const parent = el.closest('label, div, li, .form-check, .checkbox') || el;
          const meta = `${el.id || ''} ${el.name || ''} ${el.className || ''} ${el.getAttribute('data-tf-element-role') || ''} ${parent ? parent.innerText || '' : ''}`.toLowerCase();
          return el.required || el.getAttribute('aria-required') === 'true' || /consent|terms|agree|privacy|disclosure|tcpa|condition|policy|confirm|accept|must|required|mandatory|continue|certify|18\+|resident|marketing/i.test(meta);
        }) || uncheckedBoxes[0];
        const sel = consentBox.id ? `#${consentBox.id}` : consentBox.name ? `input[name="${consentBox.name}"]` : consentBox.className ? `.${consentBox.className.split(' ')[0]}` : 'input[type="checkbox"]';
        return {
          action: 'check',
          selector: sel,
          detail: 'Tự động tích ô checkbox điều khoản / khảo sát'
        };
      }

      // 3. Nút Jump Page / Reward Screen
      if (opts.clickJumpPage !== false) {
        const jumpCta = Array.from(document.querySelectorAll('.cta-button, .rjp-cta-button, .sjp-cta-button, a[href*="/next"], [aria-label*="Reward" i], [aria-label*="Get My" i]')).find(isVisible);
        if (jumpCta) {
          const sel = jumpCta.className ? `.${jumpCta.className.split(' ')[0]}` : 'a[href*="/next"]';
          return {
            action: 'click',
            selector: sel,
            detail: 'Tự động click nút Jump Page / Reward (.cta-button)'
          };
        }
      }

      // 4. Nút Submit / Continue / Next (bao gồm cả button trong form và các thẻ div.button, div.btn-option ngoài form)
      if (opts.multiStepSubmit !== false) {
        const submitBtn = Array.from(document.querySelectorAll(['button[type="submit"]', 'input[type="submit"]', '[data-vector-submit="true"]', 'button.continue-btn', 'button.submit-btn', 'button.next-btn', '#btnSubmit', '#btnNext', '#btnContinue', 'button[id*="submit" i]', 'button[id*="continue" i]', 'button[id*="next" i]', 'button[class*="submit" i]', 'button[class*="continue" i]', 'button[class*="next" i]', 'div.btn-option', 'div.button', 'div.btn', '[id="btn-option"]', '[id*="btn-option"]', '.btn-option', 'div[class*="submit" i]', 'div[class*="continue" i]', 'div[class*="next" i]', 'div[class*="button" i]', 'div[class*="btn" i]', '[role="button"]'].join(', '))).find(isVisible);
        if (submitBtn) {
          const sel = submitBtn.id ? `#${submitBtn.id}` : submitBtn.className ? `.${submitBtn.className.split(' ')[0]}` : submitBtn.tagName === 'BUTTON' ? 'button[type="submit"]' : '.btn-option';
          return {
            action: 'click',
            selector: sel,
            detail: 'Tự động click nút Submit / Continue để chuyển màn'
          };
        }

        // 5. Fallback Form/Div Submit nếu không có nút riêng: tìm trong form hoặc div container chứa input
        const anyContainer = Array.from(document.querySelectorAll('form, [role="form"], .form, .form-container, .survey-container, .quiz-container, div:has(input), div.input, div.button, .btn-option')).find(isVisible);
        if (anyContainer) {
          const btn = anyContainer.querySelector('button, input[type="button"], input[type="submit"], div.button, div.btn-option, .btn-option, [role="button"], a.btn');
          if (btn) {
            const sel = btn.id ? `#${btn.id}` : btn.className ? `.${btn.className.split(' ')[0]}` : 'button';
            return {
              action: 'click',
              selector: sel,
              detail: 'Tự động kích hoạt nút trong container form/div'
            };
          }
          const sel = anyContainer.id ? `#${anyContainer.id}` : anyContainer.tagName === 'FORM' ? 'form' : 'div';
          return {
            action: 'click',
            selector: `${sel} button, ${sel} input[type="button"], ${sel} .btn-option, ${sel}`,
            detail: 'Tự động kích hoạt gửi form/div'
          };
        }
      }
      return null;
    }, {
      formScope: targetFrame._activeAutofillFormScope || null,
      solveBotQuiz: cfg.solveBotQuiz !== false,
      solveSurveyCards: cfg.solveSurveyCards !== false,
      clickJumpPage: cfg.clickJumpPage !== false,
      multiStepSubmit: cfg.multiStepSubmit !== false,
      pickRandom: cfg.pickRandom !== false
    });
  } catch {
    return null;
  }
}
export { detectSmartFallbackAction };
