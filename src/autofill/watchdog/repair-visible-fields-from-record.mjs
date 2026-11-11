import { createHash } from 'node:crypto';
import { inspectFormRepairState } from '../../ai-assist/inspect-form-repair-state.mjs';
import { buildRepairActions } from '../../ai-assist/repair/build-repair-actions.mjs';
import { executeAction } from '../../ai-assist/execute-action.mjs';

const attemptedStates = new WeakMap();

/**
 * Thử sửa các field nhận diện được bằng record trước khi phải xếp hàng hoặc gọi AI bên ngoài.
 * Không tự tạo dữ liệu, không submit và không thử lại cùng trạng thái/record liên tục.
 * @param {object} page Tab bị kẹt sau lượt thư viện.
 * @param {object} record Dữ liệu thực tế của đúng tab.
 * @param {object} session Phiên nhận bộ đếm field đã xác minh.
 * @param {object} visibleState Chữ ký giao diện của lượt quét hiện tại.
 * @param {object} options Callback log nghiệp vụ.
 * @return {Promise<number>} Số field đã được sửa và xác minh.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function repairVisibleFieldsFromRecord(page, record, session, visibleState, options) {
  if (page._aiAssistRunning || page._aiFormFixing) return 0;
  const signature = createHash('sha256').update(JSON.stringify([visibleState.signature, record, session.assignedEmail])).digest('hex');
  if (attemptedStates.get(page) === signature) return 0;
  page._aiFormFixing = true;
  try {
    const diagnostic = await inspectFormRepairState(page);
    if (!diagnostic) return 0;
    attemptedStates.set(page, signature);
    const repair = buildRepairActions(diagnostic, record || {}, session);
    let verifiedCount = 0;
    for (const action of repair.actions) {
      if (page.isClosed() || session.isClosed) break;
      const result = await executeAction(page, action, session, { repairOnly: true, allowSubmit: false, record });
      if (result.ok && result.verified) verifiedCount++;
    }
    if (verifiedCount) options.onLog?.({ type: 'autofill_local_repair', detail: `Đã xác minh ${verifiedCount} field sửa trực tiếp từ record, không cần đợi AI.` }, page);
    return verifiedCount;
  } catch { return 0; }
  finally { page._aiFormFixing = false; }
}
