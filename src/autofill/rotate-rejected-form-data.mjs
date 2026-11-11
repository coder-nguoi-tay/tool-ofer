import { MAX_REJECT_ROTATIONS } from './state/max-reject-rotations.mjs';

/**
 * Khi form từ chối email hoặc thông tin đã điền (cùng ô bị báo lỗi ≥ 2 lần trong phiên), xin dữ liệu mới
 * qua options.onFormRejected (app đưa email/record cũ vào danh sách bị từ chối, không dùng lại) rồi xoá
 * giá trị cũ trên form để lượt quét sau điền lại bằng dữ liệu mới.
 * Ô trống báo "required" là do mình chưa điền, không tính là dữ liệu bị từ chối.
 *
 * @param {object} frame Frame chứa form.
 * @param {object} record Record đang dùng cho tab (bị sửa trực tiếp).
 * @param {object} session Phiên đang chạy.
 * @param {object} options Tuỳ chọn attachAutofill (onFormRejected, onLog).
 * @param {object} err Kết quả phát hiện lỗi sau submit (firstError, fieldName, fieldId, fieldType, fieldValue, allErrors).
 * @return {Promise<boolean>} True nếu đã đổi sang dữ liệu mới.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function rotateRejectedFormData(frame, record, session, options, err) {
  if (typeof options.onFormRejected !== 'function' || !record) return false;
  const fieldText = `${err.fieldName || ''} ${err.fieldId || ''} ${err.fieldType || ''}`;
  const errorText = [err.firstError, ...(err.allErrors || [])].filter(Boolean).join(' | ');
  const isEmail = /mail/i.test(fieldText) || !err.fieldName && !err.fieldId && /e-?mail/i.test(errorText);
  // Ô trống: lỗi do chưa điền chứ không phải dữ liệu bị từ chối.
  if (!err.fieldValue && !(isEmail && session.emailFilled)) return false;
  const key = isEmail ? 'email' : err.fieldName || err.fieldId || 'field';
  session._rejectCounts = session._rejectCounts || {};
  session._rejectCounts[key] = (session._rejectCounts[key] || 0) + 1;
  // Trang nói rõ email bị từ chối (invalid / đã dùng / bị chặn) → đổi ngay. Lỗi khác có thể do trang
  // kiểm tra chậm hoặc gõ chưa xong: cho thử lại một lần.
  const explicitEmailReject = isEmail && /invalid|not valid|already|in use|exists|registered|blocked|undeliverable|not allowed|not accepted/i.test(errorText);
  if (!explicitEmailReject && session._rejectCounts[key] < 2) return false;
  session._rejectRotations = (session._rejectRotations || 0) + 1;
  if (session._rejectRotations > MAX_REJECT_ROTATIONS) return false;
  session._rejectCounts[key] = 0;
  const oldValue = isEmail ? session.assignedEmail || record.email || '' : err.fieldValue;
  const replacement = await Promise.resolve(options.onFormRejected(session, {
    kind: isEmail ? 'email' : 'record',
    field: key,
    error: errorText,
    record
  })).catch(() => null);
  if (!replacement) {
    options.onLog?.({
      type: 'form_rejected_no_data',
      detail: `Form từ chối ${isEmail ? 'email' : `ô ${key}`} (${errorText}) nhưng đã hết dữ liệu mới để thay.`
    });
    return false;
  }
  if (isEmail) {
    Object.assign(record, {
      email: replacement.email,
      emailaddress: replacement.email,
      mail: replacement.email,
      assignedEmail: replacement.email
    });
    session.emailFilled = false;
    session.emailFillAt = 0;
    session.emailScreenSubmitted = false;
  } else {
    const keepEmail = {
      email: record.email,
      emailaddress: record.emailaddress,
      mail: record.mail,
      assignedEmail: record.assignedEmail
    };
    Object.keys(record).forEach(k => {
      delete record[k];
    });
    Object.assign(record, replacement, Object.fromEntries(Object.entries(keepEmail).filter(([, v]) => v)));
  }
  // Xoá giá trị cũ + cờ đã điền để lượt quét sau gõ lại bằng dữ liệu mới.
  await frame.evaluate(onlyEmail => {
    document.querySelectorAll('input, textarea, select').forEach(el => {
      if (!el.hasAttribute('data-ux-filled')) return;
      if (onlyEmail && !/mail/i.test(`${el.name} ${el.id} ${el.type}`)) return;
      el.removeAttribute('data-ux-filled');
      if (!['checkbox', 'radio', 'hidden', 'submit', 'button'].includes(el.type)) {
        el.value = '';
        el.dispatchEvent(new Event('input', {
          bubbles: true
        }));
      }
    });
  }, isEmail).catch(() => {});
  options.onLog?.({
    type: isEmail ? 'email_rejected_rotated' : 'record_rejected_rotated',
    detail: isEmail ? `Form từ chối email ${oldValue} (${errorText}); đã cho vào danh sách bị từ chối và đổi sang ${replacement.email}.` : `Form từ chối ô ${key} = "${String(oldValue).slice(0, 40)}" (${errorText}); đã bỏ record này và đổi sang record mới.`
  });
  return true;
}
export { rotateRejectedFormData };
