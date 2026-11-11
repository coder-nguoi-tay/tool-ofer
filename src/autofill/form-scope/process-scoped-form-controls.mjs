import { processScopedWidgets } from './process-scoped-widgets.mjs';
import { handleCustomGenderButtons } from '../handle-custom-gender-buttons.mjs';
import { handleRadioAndSurveyOptions } from '../handle-radio-and-survey-options.mjs';
import { syncUplevelRewardsFields } from '../sync-uplevel-rewards-fields.mjs';
import { solveSurveyStep } from '../../../survey-solver.mjs';
import { addActionCount } from '../add-action-count.mjs';
import { addVerifiedFieldCount } from '../add-verified-field-count.mjs';
import { extractPrepopulatedDataFromPage } from '../extract-prepopulated-data-from-page.mjs';
import { fillAlphaIntentSpecialFields } from '../fill-alpha-intent-special-fields.mjs';

/**
 * Hoàn tất lựa chọn thuộc form đang điền, giữ offer cards/skip bên ngoài cho màn riêng.
 * @param {object} context Frame, dữ liệu record, phiên, tùy chọn và tiến độ lượt quét.
 * @return {Promise<void>} Hoàn tất các control trong phạm vi hiện tại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function processScopedFormControls({ frame, record, session, options, frameProgress, page }) {
  session.autofillStep = 'xử lý widget trong form';
  const widgetActions = await processScopedWidgets({ frame, page, record, options });
  if (widgetActions) {
    frameProgress.filledInThisPass += widgetActions;
    session.lastActionTime = Date.now();
    addActionCount(session, widgetActions);
    frameProgress.widgetAdvanced = true;
    return;
  }
  session.autofillStep = 'xử lý dữ liệu có sẵn';
  const prepopulated = await extractPrepopulatedDataFromPage(frame).catch(() => null);
  for (const [field, value] of Object.entries(prepopulated || {})) if (value && !record[field]) record[field] = value;
  session.autofillStep = 'xử lý trường Alpha Intent';
  const alpha = await fillAlphaIntentSpecialFields(frame, record).catch(() => 0);
  session.autofillStep = 'xử lý nút giới tính';
  const gender = await handleCustomGenderButtons(frame, record).catch(() => 0);
  session.autofillStep = 'xử lý trường Uplevel';
  const synced = await syncUplevelRewardsFields(frame, record).catch(() => 0);
  session.autofillStep = 'xử lý lựa chọn khảo sát';
  const answered = await handleRadioAndSurveyOptions(frame, record, session, options).catch(() => 0);
  session.autofillStep = 'xử lý survey solver';
  const survey = await solveSurveyStep(frame, record, { ...options, autoClickNext: false }).catch(() => ({ answeredCount: 0 }));
  const actions = alpha + gender + synced + answered + survey.answeredCount;
  if (!actions) return;
  frameProgress.filledInThisPass += actions;
  session.lastActionTime = Date.now();
  if (alpha + gender + synced > 0) addVerifiedFieldCount(session, alpha + gender + synced);
  if (answered + survey.answeredCount > 0) addActionCount(session, answered + survey.answeredCount);
  options.onLog?.({ type: 'survey_answered', detail: `Hoàn tất ${actions} lựa chọn trong form đang xử lý.` }, page);
}
