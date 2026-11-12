import { handleYesNoStep } from './handle-yes-no-step.mjs';
import { handleNoSurvey } from './adsmith/handle-no-survey.mjs';
import { processScopedFormControls } from './form-scope/process-scoped-form-controls.mjs';
import { addActionCount } from './add-action-count.mjs';
import { addVerifiedFieldCount } from './add-verified-field-count.mjs';
import { extractPrepopulatedDataFromPage } from './extract-prepopulated-data-from-page.mjs';
import { fillAlphaIntentSpecialFields } from './fill-alpha-intent-special-fields.mjs';
import { handleAdsmithSurvey } from './handle-adsmith-survey.mjs';
import { handleAlphaIntentQuestions } from './handle-alpha-intent-questions.mjs';
import { handleAlphaIntentSoiCards } from './handle-alpha-intent-soi-cards.mjs';
import { handleCustomGenderButtons } from './handle-custom-gender-buttons.mjs';
import { handleGoogleOauthSkip } from './handle-google-oauth-skip.mjs';
import { handleMuiQuestionButtons } from './handle-mui-question-buttons.mjs';
import { handleOfferwallTasks } from './handle-offerwall-tasks.mjs';
import { handleRadioAndSurveyOptions } from './handle-radio-and-survey-options.mjs';
import { handleSurveySemanticQuestions } from './handle-survey-semantic-questions.mjs';
import { handleTwyOfferCards } from './handle-twy-offer-cards.mjs';
import { solveSurveyStep } from '../../survey-solver.mjs';
import { syncUplevelRewardsFields } from './sync-uplevel-rewards-fields.mjs';

/**
 * Xử lý survey, offer cards và các trường đặc thù trước lượt điền thông thường.
 * @param {object} context Frame, dữ liệu lead và tiến độ của lượt quét.
 * @return {Promise<void>} Hoàn tất bước xử lý frame.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function processFrameSurveys({
  frame,
  record,
  options,
  page,
  session,
  frameProgress
}) {
  const yesNo = await handleNoSurvey(frame, page, options) || await handleYesNoStep({ frame, page, options });
  if (yesNo.handled) {
    frameProgress.widgetAdvanced = true;
    if (yesNo.actions) {
      frameProgress.filledInThisPass += yesNo.actions;
      session.lastActionTime = Date.now();
      addActionCount(session, yesNo.actions);
    }
    return;
  }
  if (frameProgress.formScope) {
    session.autofillStep = 'xử lý control trong form';
    await processScopedFormControls({ frame, record, session, options, frameProgress, page });
    return;
  }
  const nowTwy = Date.now();
  if (!frame._uxTwyHandledAt || nowTwy - frame._uxTwyHandledAt > 2000) {
    frame._uxTwyHandledAt = nowTwy;
    try {
      session.autofillStep = 'xử lý campaign Twy';
      await handleTwyOfferCards(frame, record, {
        onLog: options.onLog
      });
    } catch (twyErr) {
      console.log(`[TwyCards] Lỗi xử lý thẻ co-reg: ${twyErr.message}`);
    }
  }

  // Xử lý khảo sát co-reg "adsmith forge" (#AS_SURVEY iframe): focus frame + trả lời + Continue
  try {
    session.autofillStep = 'xử lý khảo sát Adsmith';
    await handleAdsmithSurvey(page, frame, {
      onLog: options.onLog
    });
  } catch (asErr) {
    console.log(`[AsSurvey] Lỗi xử lý khảo sát adsmith: ${asErr.message}`);
  }

  // Xử lý thẻ SOI yes/no "alpha-intent" (SweepstakesAlerts/PrizeGrab): tick consent + chọn Yes/No 70/30
  try {
    session.autofillStep = 'xử lý thẻ Alpha SOI';
    await handleAlphaIntentSoiCards(page, frame, {
      onLog: options.onLog
    });
  } catch (soiErr) {
    console.log(`[AlphaSOI] Lỗi xử lý thẻ SOI: ${soiErr.message}`);
  }

  // Tự trả lời các màn câu hỏi khảo sát alpha-intent (button[id^="answer-"], question-answer-button)
  try {
    session.autofillStep = 'xử lý câu hỏi Alpha Intent';
    await handleAlphaIntentQuestions(page, frame, {
      onLog: options.onLog
    });
  } catch (qErr) {
    console.log(`[AlphaQ] Lỗi xử lý câu hỏi khảo sát: ${qErr.message}`);
  }

  // Câu hỏi semantic (age / preference / vehicle) theo tài liệu nghiên cứu §17:
  // phân loại → match record / block-score → click; mơ hồ thì không bấm.
  try {
    session.autofillStep = 'xử lý câu hỏi semantic';
    await handleSurveySemanticQuestions(page, frame, {
      onLog: options.onLog,
      record
    });
  } catch (semErr) {
    console.log(`[SemanticQ] Lỗi xử lý câu hỏi age/vehicle/preference: ${semErr.message}`);
  }

  // Xử lý màn offer-wall "Take the Deal" (iframe sdk.scrptk.com): chọn task → CTA → Skip
  try {
    session.autofillStep = 'xử lý offerwall';
    await handleOfferwallTasks(page, frame, {
      onLog: options.onLog
    });
  } catch (owErr) {
    console.log(`[OWTask] Lỗi xử lý offer-wall task: ${owErr.message}`);
  }

  // Xử lý màn câu hỏi MUI (#questionText + button[data-tf-element-role="submit"]): random đáp án
  try {
    session.autofillStep = 'xử lý câu hỏi MUI';
    await handleMuiQuestionButtons(page, frame, {
      onLog: options.onLog
    });
  } catch (muiErr) {
    console.log(`[MuiQ] Lỗi xử lý câu hỏi MUI: ${muiErr.message}`);
  }

  // Xử lý màn Google OAuth grant ("Continue Through Gmail"): bấm Skip bỏ qua
  try {
    session.autofillStep = 'xử lý bước Google OAuth';
    await handleGoogleOauthSkip(page, frame, {
      onLog: options.onLog
    });
  } catch (gErr) {
    console.log(`[GmailSkip] Lỗi xử lý màn Gmail OAuth: ${gErr.message}`);
  }

  // Tự động trích xuất thông tin có sẵn trong globalData/geolocation/jLead để làm giàu record phiên này
  try {
    session.autofillStep = 'xử lý dữ liệu có sẵn';
    const prepopData = await extractPrepopulatedDataFromPage(frame);
    if (prepopData && typeof prepopData === 'object') {
      for (const [k, v] of Object.entries(prepopData)) {
        if (v && (!record[k] || record[k] === '')) {
          record[k] = v;
        }
      }
    }
  } catch {}

  // Xử lý và đồng bộ toàn bộ các trường đặc thù của Alpha Intent / Web Components:
  // #name, #input-fullname, #input-gender, #has_tcpa_optin, #input-address, #input-dob, #input-phone
  session.autofillStep = 'xử lý trường Alpha Intent';
  const alphaFilled = await fillAlphaIntentSpecialFields(frame, record);
  if (alphaFilled > 0) {
    frameProgress.filledInThisPass += alphaFilled;
    addVerifiedFieldCount(session, alphaFilled);
    options.onLog?.({
      type: 'field_filled',
      detail: `Đã điền và đồng bộ ${alphaFilled} trường đặc thù Alpha Intent.`
    }, page);
  }

  // Xử lý custom Gender buttons (#gender, #male, #female, .gbtn) như trên Uplevel Rewards
  session.autofillStep = 'xử lý nút giới tính';
  const customGenderCount = await handleCustomGenderButtons(frame, record);
  if (customGenderCount > 0) {
    frameProgress.filledInThisPass += customGenderCount;
    addVerifiedFieldCount(session, customGenderCount);
    options.onLog?.({
      type: 'field_filled',
      detail: `Đã chọn giới tính ${record.gender || 'M'} trên custom button.`
    }, page);
  }

  // Xử lý và đồng bộ toàn diện các trường đặc thù của Uplevel Rewards (#reg-container, telephone_two mask, raw 10 digits hidden, buttons, active)
  session.autofillStep = 'xử lý trường Uplevel';
  const uplevelSynced = await syncUplevelRewardsFields(frame, record);
  if (uplevelSynced > 0) {
    frameProgress.filledInThisPass += uplevelSynced;
    addVerifiedFieldCount(session, uplevelSynced);
    options.onLog?.({
      type: 'field_filled',
      detail: `Đã đồng bộ ${uplevelSynced} trường/trạng thái Uplevel Rewards (#reg-container).`
    }, page);
  }

  // 0. ƯU TIÊN HÀNG ĐẦU: Tự động bấm nút khảo sát / btn-option / radio ngay lập tức
  // để không bị trễ do phải duyệt qua danh sách các input ẩn trên các trang khảo sát
  try {
    session.autofillStep = 'xử lý lựa chọn khảo sát';
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
      session.autofillStep = 'xử lý survey solver';
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
}
