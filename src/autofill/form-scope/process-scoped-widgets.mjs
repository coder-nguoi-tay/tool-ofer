import { handleSurveySemanticQuestions } from '../handle-survey-semantic-questions.mjs';
import { handleTwyOfferCards } from '../handle-twy-offer-cards.mjs';
import { handleAlphaIntentQuestions } from '../handle-alpha-intent-questions.mjs';
import { handleMuiQuestionButtons } from '../handle-mui-question-buttons.mjs';

/**
 * Giữ handler khảo sát đặc thù hoạt động trong scope; không mở rộng ra phần ẩn hoặc form phụ.
 * @param {object} context Frame, page, record và callback của lượt quét.
 * @return {Promise<number>} Số thao tác widget thực sự được thực hiện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function processScopedWidgets({ frame, page, record, options }) {
  if (!frame._uxTwyHandledAt || Date.now() - frame._uxTwyHandledAt > 2000) {
    frame._uxTwyHandledAt = Date.now();
    const actions = await handleTwyOfferCards(frame, record, options);
    if (actions) return actions;
  }
  const semantic = await handleSurveySemanticQuestions(page, frame, { ...options, record });
  if (semantic) return semantic;
  const answers = await handleAlphaIntentQuestions(page, frame, options);
  if (answers) return answers;
  return handleMuiQuestionButtons(page, frame, options);
}
