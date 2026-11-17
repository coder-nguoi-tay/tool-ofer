// Bản giải riêng của offer 2615, chép từ src/autofill/adsmith/handle-no-survey.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
import { isNoSurveyFrame } from './is-no-survey-frame.mjs';
import { inspectNoSurvey } from './inspect-no-survey.mjs';
import { humanClick } from '../human-click.mjs';

const progress = new WeakMap();
/** Màn mờ .Processing chờ AJAX quá lâu thì gỡ màn mờ và bấm lại Continue một lần (gửi lại request của Adsmith). */
const ADSMITH_RECLICK_AFTER_MS = 15_000;
/** Không bận liên tục chừng này mới coi là hết đợt chờ (tránh reset ngay lúc vừa gỡ màn mờ để bấm lại). */
const ADSMITH_IDLE_RESET_MS = 3_000;
/**
 * Trang khảo sát Adsmith đứng yên chừng này thì watcher F5 trang cha (người dùng chốt 2026-11-15: 40 giây; chấp nhận
 * F5 làm lại khảo sát). F5 đi qua reloadStuckPage để dùng chung giới hạn 3 lần/URL, tải lại bằng GET và log.
 */
export const ADSMITH_STUCK_RELOAD_MS = 40_000;

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
  const session = options.session || page?._autofillSession;
  if (session?.offerSolver === 'generic') return null;
  if (!await isNoSurveyFrame(frame)) return null;
  page._activeAutofillFrame = frame;
  const waiting = { handled: true, actions: 0 };
  const current = await frame.evaluate(inspectNoSurvey).catch(() => null);
  if (!current) return waiting;
  let state = progress.get(frame);
  if (!state || state.identity !== current.identity) {
    state = { identity: current.identity, attempts: 0, nextAt: 0, logged: false, busySince: null, idleSince: null, reclicked: false };
    progress.set(frame, state);
  }
  if (current.busy) {
    // Màn mờ đang chặn chuột: bấm vào chỉ trúng màn mờ. Chờ mạng/AJAX; quá 15 giây thì gỡ màn mờ, bấm lại Continue
    // một lần (Adsmith chỉ có .done(), request lỗi là treo mãi). Không tính là thao tác để mốc F5 40 giây không bị đẩy lùi.
    state.busySince ??= Date.now();
    state.idleSince = null;
    const busyMs = Date.now() - state.busySince;
    if (busyMs >= ADSMITH_RECLICK_AFTER_MS && !state.reclicked && current.next) {
      state.reclicked = true;
      options.onLog?.({ type: 'adsmith_reclick_continue', detail: `Adsmith AS_IFRAME: màn mờ .Processing chờ ${Math.round(busyMs / 1000)}s; gỡ màn mờ và bấm lại Continue một lần.` }, page);
      await frame.evaluate(() => { document.querySelectorAll('.Processing').forEach(element => { element.style.display = 'none'; }); }).catch(() => {});
      await humanClick(page, frame.locator(current.next)).catch(() => false);
    }
    return waiting;
  }
  if (state.busySince) {
    state.idleSince ??= Date.now();
    if (Date.now() - state.idleSince >= ADSMITH_IDLE_RESET_MS) Object.assign(state, { busySince: null, idleSince: null, reclicked: false });
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
  // trước đây trang đứng chờ mãi.
  if (current.subformOpen || !current.next || options.autoSubmit === false) {
    // Ghi một lần mỗi màn lý do đứng chờ + chữ các nút đang hiện, để chẩn đoán DOM thật của iframe.
    if (!state.waitLogged) {
      state.waitLogged = true;
      const reason = options.autoSubmit === false ? 'autoSubmit tắt' : current.subformOpen ? 'subform đang mở' : 'không thấy nút Continue/Next';
      options.onLog?.({ type: 'adsmith_no_wait_reason', detail: `Adsmith AS_IFRAME: đã chọn xong nhưng chưa bấm tiếp (${reason}); nút đang hiện: ${(current.buttons || []).join(' | ') || 'không có'}.` }, page);
    }
    return waiting;
  }
  // Continue chưa qua bước (website đang xử lý AJAX hoặc báo thiếu câu): không dừng hẳn như trước
  // (log 2026-11-12 đứng 146s sau 2 lần), mà thử lại với khoảng chờ giãn dần 5s, 10s, 20s… tối đa 60s.
  if (state.attempts >= 1) {
    options.onLog?.({ type: 'adsmith_continue_rejected', detail: `Adsmith AS_IFRAME: Continue lần ${state.attempts} chưa qua bước; lỗi website: ${current.error || 'không có'}; câu bị đánh dấu thiếu: ${current.noAns || 0}. Thử lại.` }, page);
  }
  if (!await humanClick(page, frame.locator(current.next))) return waiting;
  state.attempts++;
  state.nextAt = Date.now() + (state.attempts < 2 ? 1500 : Math.min(60000, 5000 * 2 ** (state.attempts - 2)));
  options.onLog?.({ type: 'submit_clicked', detail: 'Adsmith AS_IFRAME: đã chọn đủ đáp án, bấm Continue.' }, page);
  return { handled: true, actions: 1 };
}
