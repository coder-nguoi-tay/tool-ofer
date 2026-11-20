// Bản giải riêng của offer 2615, chép từ src/autofill/form-scope/rescue-required-field.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
import { createHash } from 'node:crypto';
import { inspectRescueTarget } from './inspect-rescue-target.mjs';
import { executeAction } from '../../../../../ai-assist/execute-action.mjs';

const failedRepairs = new WeakMap();

/**
 * Repair field lỗi bằng executor dùng chung và record thật, xác minh trước khi trả thành công.
 * @param {object} context Frame, page, field lỗi, record, session và scope của lượt quét.
 * @return {Promise<boolean>} Chỉ true khi giá trị hoặc checked đã được xác minh.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function rescueRequiredField({ frame, page, fieldInfo, record, session, formScope, options = {} }) {
  const target = await frame.evaluate(inspectRescueTarget, { fieldInfo, formScope }).catch(() => null);
  if (!target) return false;
  const { selector } = target;
  const signature = createHash('sha256').update(JSON.stringify([target, fieldInfo.reason, record, session?.assignedEmail])).digest('hex');
  const previous = failedRepairs.get(frame);
  const attempts = previous?.signature === signature ? previous.attempts : 0;
  if (attempts >= 2) return false;
  const action = fieldInfo.type === 'checkbox' ? 'check' : /select/i.test(fieldInfo.type || '') ? 'select' : 'fill';
  const targetPage = page || frame.page();
  const result = await executeAction(targetPage, { action, selector }, null, { repairOnly: true, allowSubmit: false, record: { ...record, assignedEmail: session?.assignedEmail || record?.assignedEmail } });
  if (result.ok && result.verified) failedRepairs.delete(frame);
  else failedRepairs.set(frame, { signature, attempts: attempts + 1 });
  if (!result.ok) options.onLog?.({ type: result.reason === 'missing_record' ? 'missing_record' : 'rescue_unverified', field: fieldInfo.id, reason: result.reason, detail: 'Chưa sửa được field từ dữ liệu hiện có; giữ chặn submit.' }, targetPage);
  return result.ok && result.verified;
}
