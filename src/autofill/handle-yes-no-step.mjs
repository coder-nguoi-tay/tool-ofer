import { handleSurveySave } from './handle-survey-save.mjs';
import { readYesNoStep } from './yes-no/read-step.mjs';
import { getYesNoStepState } from './yes-no/get-step-state.mjs';
import { selectYesNoAnswer } from './yes-no/select-answer.mjs';
import { clickYesNoContinue } from './yes-no/click-continue.mjs';

/**
 * Điều phối đọc câu hỏi, lưu subform, chọn Yes/No rồi Continue qua các module phụ trách riêng.
 * @param {object} context Frame, tab và tùy chọn của lượt autofill.
 * @return {Promise<object>} Quyết định giữ bước/điền subform và số thao tác đã thực hiện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function handleYesNoStep({ frame, page, options = {} }) {
  const scope = frame._activeAutofillFormScope || null;
  const current = await readYesNoStep(frame, scope);
  if (!current) { getYesNoStepState(frame, null, options, page); return { handled: false, actions: 0 }; }
  const save = await handleSurveySave(frame, page, current, options);
  if (save) return save;
  const state = getYesNoStepState(frame, current, options, page);
  if (!state) return { handled: false, actions: 0 };
  if (Date.now() < state.nextAt) return { handled: true, actions: 0 };
  const question = current.questions.find(item => state.no ? !item.noSelected : !item.yesSelected);
  if (question) return selectYesNoAnswer({ frame, page, question, state, options });
  if (current.needsInput) return { handled: false, actions: 0 };
  return clickYesNoContinue({ frame, page, scope, state, options });
}
