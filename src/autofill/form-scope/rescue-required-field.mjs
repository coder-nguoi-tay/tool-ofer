import { inspectRescueTarget } from './inspect-rescue-target.mjs';
import { executeAction } from '../../ai-assist/execute-action.mjs';

/**
 * Repair field lỗi bằng executor dùng chung và record thật, xác minh trước khi trả thành công.
 * @param {object} context Frame, page, field lỗi, record, session và scope của lượt quét.
 * @return {Promise<boolean>} Chỉ true khi giá trị hoặc checked đã được xác minh.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function rescueRequiredField({ frame, page, fieldInfo, record, session, formScope, options = {} }) {
  const selector = await frame.evaluate(inspectRescueTarget, { fieldInfo, formScope }).catch(() => null);
  if (!selector) return false;
  const action = fieldInfo.type === 'checkbox' ? 'check' : /select/i.test(fieldInfo.type || '') ? 'select' : 'fill';
  const targetPage = page || frame.page();
  const result = await executeAction(targetPage, { action, selector }, null, { repairOnly: true, allowSubmit: false, record: { ...record, assignedEmail: session?.assignedEmail || record?.assignedEmail } });
  if (!result.ok) options.onLog?.({ type: result.reason === 'missing_record' ? 'missing_record' : 'rescue_unverified', field: fieldInfo.id, reason: result.reason, detail: 'Chưa sửa được field từ dữ liệu hiện có; giữ chặn submit.' }, targetPage);
  return result.ok && result.verified;
}
