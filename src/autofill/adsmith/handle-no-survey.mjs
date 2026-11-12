import { isNoSurveyFrame } from './is-no-survey-frame.mjs';
import { inspectNoSurvey } from './inspect-no-survey.mjs';
import { humanClick } from '../human-click.mjs';

const progress = new WeakMap();

/**
 * Chọn No cho mọi câu hỏi của AS_IFRAME được chỉ định, xác minh xong mới bấm Continue.
 * @param {object} frame Frame khảo sát đang được quét.
 * @param {object} page Tab dùng để dispatch chuột mô phỏng.
 * @param {object} options Quyền tự submit và callback log.
 * @return {Promise<object|null>} Kết quả giữ bước/thao tác, null nếu quy tắc không áp dụng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function handleNoSurvey(frame, page, options = {}) {
  if (!await isNoSurveyFrame(frame)) return null;
  page._activeAutofillFrame = frame;
  const waiting = { handled: true, actions: 0 };
  const current = await frame.evaluate(inspectNoSurvey).catch(() => null);
  if (!current || current.busy) return waiting;
  let state = progress.get(frame);
  if (!state || state.identity !== current.identity) {
    state = { identity: current.identity, attempts: 0, nextAt: 0, logged: false };
    progress.set(frame, state);
  }
  if (Date.now() < state.nextAt) return waiting;
  const unanswered = current.questions.filter(question => !question.selected);
  if (unanswered.length) {
    // Trả lời hết câu No còn thiếu trong một lượt (mỗi câu vẫn là click chuột thật qua humanClick).
    // Trước đây mỗi lượt quét chỉ một câu + chờ 600ms: ~1,1s/câu, trang 6 câu mất 13 lượt (~10s).
    let verifiedCount = 0;
    for (const question of unanswered) {
      const choice = frame.locator(question.selector);
      if (!await humanClick(page, choice)) break;
      // li của đáp án vừa bấm (No, hoặc Yes với câu chỉ có Yes) phải có class Active.
      if (await choice.evaluate(element => Boolean(element.closest('li.No.Active, li.Yes.Active'))).catch(() => false)) verifiedCount++;
    }
    state.nextAt = Date.now() + 400;
    if (verifiedCount) options.onLog?.({ type: 'survey_answered', detail: `Adsmith AS_IFRAME: đã xác minh ${verifiedCount} câu theo quy tắc riêng (Yes; quảng cáo Dove/khung radio thì No).` }, page);
    return { handled: true, actions: verifiedCount };
  }
  // missingNo (câu bắt buộc không có đáp án No) không chặn Continue nữa: đã chọn No hết chỗ có thể, website tự kiểm tra;
  // trước đây trang đứng chờ mãi. Giới hạn 2 lần Continue bên dưới vẫn giữ.
  if (current.subformOpen || !current.next || options.autoSubmit === false) {
    // Ghi một lần mỗi màn lý do đứng chờ + chữ các nút đang hiện, để chẩn đoán DOM thật của iframe.
    if (!state.waitLogged) {
      state.waitLogged = true;
      const reason = options.autoSubmit === false ? 'autoSubmit tắt' : current.subformOpen ? 'subform đang mở' : 'không thấy nút Continue/Next';
      options.onLog?.({ type: 'adsmith_no_wait_reason', detail: `Adsmith AS_IFRAME: đã chọn xong nhưng chưa bấm tiếp (${reason}); nút đang hiện: ${(current.buttons || []).join(' | ') || 'không có'}.` }, page);
    }
    return waiting;
  }
  if (state.attempts >= 2) {
    if (!state.logged) options.onLog?.({ type: 'adsmith_no_waiting', detail: 'Đã chọn đáp án và thử Continue hai lần nhưng bước chưa đổi; giữ lựa chọn, chờ website.' }, page);
    state.logged = true;
    return waiting;
  }
  if (!await humanClick(page, frame.locator(current.next))) return waiting;
  state.attempts++;
  state.nextAt = Date.now() + 1500;
  options.onLog?.({ type: 'submit_clicked', detail: 'Adsmith AS_IFRAME: đã chọn đủ đáp án, bấm Continue.' }, page);
  return { handled: true, actions: 1 };
}
