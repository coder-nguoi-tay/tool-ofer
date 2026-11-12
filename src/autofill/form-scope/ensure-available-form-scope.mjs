import { resolveActiveFormScope } from './resolve-active-form-scope.mjs';

const recoveries = new WeakMap();

/**
 * Xác định lại scope tạm lỗi trước thao tác, không mở rộng ra toàn frame khi chưa xác minh được form.
 * @param {object} frame Frame giữ scope của câu hỏi/form hiện tại.
 * @return {Promise<boolean>} True nếu scope đang dùng được hoặc chưa từng khóa theo một form.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function ensureAvailableFormScope(frame) {
  if (frame.isDetached?.()) return false;
  const previous = frame._activeAutofillFormScope;
  if (!previous || previous.active !== false && !previous.unavailable) return true;
  if (!recoveries.has(frame)) {
    const recovery = resolveActiveFormScope(frame).then(scope => {
      if (!scope?.active || scope.unavailable) {
        frame._activeAutofillFormScope = scope || { ...previous, active: false, unavailable: true };
        return false;
      }
      frame._autofillScopeRecoveryRevision = (frame._autofillScopeRecoveryRevision || 0) + 1;
      return true;
    }).catch(() => { frame._activeAutofillFormScope = { ...previous, active: false, unavailable: true }; return false; })
      .finally(() => recoveries.delete(frame));
    recoveries.set(frame, recovery);
  }
  return recoveries.get(frame);
}
