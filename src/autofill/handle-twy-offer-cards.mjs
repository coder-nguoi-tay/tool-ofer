import { performSurveyAnswer } from '../survey-solver/verification/perform-survey-answer.mjs';
import { twyPickNoRatio } from './state/twy-pick-no-ratio.mjs';
import { buildTwyContactValues } from './twy/build-contact-values.mjs';
import { fillVisibleTwySubform } from './twy/fill-visible-subform.mjs';
import { inspectVisibleTwyCards } from './twy/inspect-visible-cards.mjs';
import { resolveActionTarget } from '../ai-assist/resolve-action-target.mjs';
import { clickReadyControl } from '../browser/locators/click-ready-control.mjs';

/**
 * Xử lý từng campaign Twy trong form hiện tại bằng click thật, không ép hiện nút hoặc bước ẩn.
 * @param {object} frame Frame chứa widget đang xử lý.
 * @param {object} record Dữ liệu liên hệ của phiên.
 * @param {object} options Callback log của lượt quét.
 * @return {Promise<number>} Tổng trường đã điền và thao tác thực sự thực hiện được.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function handleTwyOfferCards(frame, record = {}, options = {}) {
  if (!frame?.evaluate) return 0;
  const args = { vals: buildTwyContactValues(record), ratio: twyPickNoRatio, formScope: frame._activeAutofillFormScope || null };
  try {
    const filled = await frame.evaluate(fillVisibleTwySubform, args);
    const state = await frame.evaluate(inspectVisibleTwyCards, args);
    if (!state) return filled;
    // A real answer can change the campaign DOM: leave Continue for the next scan.
    const selector = state.answerSel || state.continueSel || state.genericNextSel;
    let clicked = false;
    if (selector) {
      const target = await resolveActionTarget(frame, selector);
      if (target.locator && state.answerSel) {
        const result = await performSurveyAnswer(frame, target.locator, options);
        clicked = result.dispatched && result.verified;
      } else if (target.locator) clicked = await clickReadyControl(target.locator, target.readiness);
    }
    if (clicked) options.onLog?.({
      type: state.answerSel ? 'twy_card_answered' : 'submit_clicked',
      field: selector,
      detail: state.answerSel ? '[Survey] Đã chọn câu trả lời của campaign đang hiển thị.' : '[Survey] Đã click Continue của campaign đang hiển thị.',
    });
    if (!frame._uxTwyStateAt || Date.now() - frame._uxTwyStateAt > 10000 || clicked) {
      frame._uxTwyStateAt = Date.now();
      options.onLog?.({ type: 'twy_state', detail: `[Survey] cards=${state.state.visibleCards}, pending=${state.state.pendingCardId || 'none'}, continue=${state.state.continueBtnId || 'chưa hiển thị'}.` });
    }
    return filled + Number(clicked);
  } catch (error) {
    options.onLog?.({ type: 'twy_error', detail: `[Survey] Không thể xử lý campaign: ${error.message}` });
    return 0;
  }
}
