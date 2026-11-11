import { addActionCount } from './add-action-count.mjs';
import { addVerifiedFieldCount } from './add-verified-field-count.mjs';
import { handleCustomGenderButtons } from './handle-custom-gender-buttons.mjs';
import { handleNegativeSkipButtons } from './handle-negative-skip-buttons.mjs';
import { handleOfferwallCards } from './handle-offerwall-cards.mjs';
import { handleRadioAndSurveyOptions } from './handle-radio-and-survey-options.mjs';
import { solveSurveyStep } from '../../survey-solver.mjs';
import { syncUplevelRewardsFields } from './sync-uplevel-rewards-fields.mjs';

/**
 * Hoàn tất các nút khảo sát, offer cards và checkbox sau lượt điền trường.
 * @param {object} context Frame, dữ liệu lead và tiến độ của lượt quét.
 * @return {Promise<boolean>} True khi cần bỏ qua frame hiện tại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function completeFrameControls({
  frameProgress,
  frame,
  record,
  session,
  options,
  page
}) {
  if (frameProgress.filledInThisPass > 0) {
    await new Promise(resolve => {
      setTimeout(resolve, 50);
    });
  }

  // Tự động trả lời câu hỏi khảo sát: chọn ngẫu nhiên radio buttons hoặc lựa chọn Yes/No/Tuổi/Thu nhập
  try {
    const customGenderPass = await handleCustomGenderButtons(frame, record);
    if (customGenderPass > 0) {
      frameProgress.filledInThisPass += customGenderPass;
      session.lastActionTime = Date.now();
      addVerifiedFieldCount(session, customGenderPass);
      session.autofillError = null;
    }
    const uplevelPass = await syncUplevelRewardsFields(frame, record);
    if (uplevelPass > 0) {
      frameProgress.filledInThisPass += uplevelPass;
      session.lastActionTime = Date.now();
      addVerifiedFieldCount(session, uplevelPass);
      session.autofillError = null;
    }
    const answeredSurvey = await handleRadioAndSurveyOptions(frame, record, session, options);
    if (answeredSurvey > 0) {
      frameProgress.filledInThisPass += answeredSurvey;
      session.lastActionTime = Date.now();
      addActionCount(session, answeredSurvey);
      session.autofillError = null;
      options.onLog?.({
        type: 'survey_answered',
        detail: `Đã tự động chọn câu trả lời khảo sát/lựa chọn (${answeredSurvey} câu).`
      }, page);
    }

    // Tích hợp SurveySolver chuyên sâu (Ratings, Matrix, Custom Checkboxes)
    if (session.offerMode !== 'consent_only') {
      const surveySolverRes = await solveSurveyStep(frame, record, {
        ...options,
        autoClickNext: false
      });
      if (surveySolverRes.answeredCount > 0) {
        frameProgress.filledInThisPass += surveySolverRes.answeredCount;
        session.lastActionTime = Date.now();
        addActionCount(session, surveySolverRes.answeredCount);
        session.autofillError = null;
        options.onLog?.({
          type: 'survey_solver_answered',
          detail: `[SurveySolver] Đã tự động giải quyết ${surveySolverRes.answeredCount} câu hỏi khảo sát/checkbox.`
        }, page);
      }
    } else {
      options.onLog?.({
        type: 'consent_only_skip_survey',
        detail: 'Chế độ consent_only: bỏ qua giải khảo sát.'
      }, page);
    }
  } catch {}

  // Tự động phát hiện và mở đồng loạt tất cả các thẻ Offerwall trên trang cuối.
  // Các tab offer con được điền song song (mỗi tab một vòng quét riêng), giới hạn
  // số tab đồng thời bằng options.maxConcurrentSubOffers, tối đa MAX_OFFER_TABS trừ tab hiện tại, để không
  // nghẽn CPU/proxy; thẻ chưa mở được sẽ tự thử lại khi có tab hoàn tất.
  if (!frameProgress.formScope) try {
    const openedOffers = await handleOfferwallCards(frame, page, options);
    if (openedOffers > 0) {
      frameProgress.filledInThisPass += openedOffers;
      addActionCount(session, openedOffers);
      session.autofillError = null;
      options.onLog?.({
        type: 'offerwall_opened',
        detail: `Đã tự động mở ${openedOffers} thẻ ưu đãi (Offerwall).`
      });
    }
  } catch {}

  // Tự động phát hiện và bấm các nút bỏ qua / skip / negative trên màn ưu đãi trung gian
  if (!frameProgress.formScope) try {
    const skippedOffers = await handleNegativeSkipButtons(frame);
    if (skippedOffers > 0) {
      frameProgress.filledInThisPass += skippedOffers;
      addActionCount(session, skippedOffers);
      session.autofillError = null;
      options.onLog?.({
        type: 'negative_skip_clicked',
        detail: `Đã tự động bấm nút bỏ qua ưu đãi trung gian (${skippedOffers} nút).`
      });
    }
  } catch {}

  // Lượt quét cuối chỉ xử lý checkbox đơn/consent. Nhóm nhiều đáp án đã được
  // solveSurveyCheckboxes chọn ngẫu nhiên đúng 2 ô và không được đổi lựa chọn ở đây.
  try {
    const cbClassification = await frame.evaluate(scopeSelector => {
      const isVisible = el => {
        if (!el || el.disabled) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]:not(:checked)')).filter(el => isVisible(el) && (!scopeSelector || el.matches(scopeSelector)));
      return checkboxes.map((cb, idx) => {
        const uid = `cb_sweep_${idx}_${Date.now()}`;
        cb.setAttribute('data-ux-sweep-cb', uid);
        const container = cb.closest('.twy-customquestion, .question, .survey-question, fieldset, .checkbox-group, .choices, .form-group, .answers, .step-content') || cb.parentElement || document.body;
        const siblings = Array.from(container.querySelectorAll('input[type="checkbox"]'));
        const label = cb.closest('label') || (cb.id ? document.querySelector(`label[for="${cb.id}"]`) : null);
        const text = ((label?.innerText || label?.textContent || '') + ' ' + (container.querySelector('h1, h2, h3, h4, legend, .question-title, .twy-cqlabel, p')?.innerText || '')).trim();
        const isConsent = /terms|privacy|consent|agree|accept|tcpa|policy|disclosure|opt[- ]?in|waiver|certify|authorize|acknowledge/i.test(text);
        return {
          uid,
          isConsent,
          singleCheckbox: siblings.length === 1
        };
      });
    }, frameProgress.formScope?.memberSelector).catch(() => []);
    for (const info of cbClassification) {
      const allowed = info.singleCheckbox || info.isConsent;
      if (!allowed) continue;
      const cb = frame.locator(`[data-ux-sweep-cb="${info.uid}"]`).first();
      if ((await cb.count().catch(() => 0)) === 0) continue;
      const isEnabled = await cb.isEnabled().catch(() => true);
      if (!isEnabled) continue;
      await cb.check({
        force: true,
        timeout: 1000
      }).catch(() => {});
      let nowChecked = await cb.isChecked().catch(() => false);
      if (!nowChecked) {
        await cb.evaluate(el => {
          const label = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
          if (label) {
            const target = label.querySelector('.checkmark, .checkbox-custom, .indicator, [class*="check"], svg') || label;
            try {
              target.click();
            } catch {}
          }
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;
          if (nativeSetter) {
            nativeSetter.call(el, true);
          } else {
            el.checked = true;
          }
          el.setAttribute('aria-checked', 'true');
          el.dispatchEvent(new Event('input', {
            bubbles: true
          }));
          el.dispatchEvent(new Event('change', {
            bubbles: true
          }));
        }).catch(() => {});
        nowChecked = await cb.isChecked().catch(() => false);
      }
      if (nowChecked) {
        await cb.evaluate(el => {
          el.dataset.uxFilled = '1';
        }).catch(() => {});
        frameProgress.filledInThisPass += 1;
        addVerifiedFieldCount(session, 1);
        options.onLog?.({
          type: 'checkbox_checked',
          detail: 'Đã tự động tích ô checkbox bắt buộc (consent/đơn) trước khi submit.'
        });
      }
    }
  } catch {}

  // Đảm bảo đồng bộ lần cuối cho Uplevel Rewards (#reg-container) trước khi kiểm tra lỗi và bấm submit
  try {
    const finalUplevel = await syncUplevelRewardsFields(frame, record);
    if (finalUplevel > 0) {
      frameProgress.filledInThisPass += finalUplevel;
      addVerifiedFieldCount(session, finalUplevel);
    }
  } catch {}

  // Tự động bấm nút gửi / tiếp tục nếu có tùy chọn autoSubmit và vừa điền hoặc tích xong các trường
  // Kiểm tra an toàn trước khi submit: Nếu trên form hiện tại vẫn còn trường bắt buộc (required / *) hoặc trường đang bị lỗi chưa có dữ liệu, KHÔNG được bấm submit!

  return false;
}
