import { safeCloneRecord } from './safe-clone-record.mjs';

/**
 * Bản sao record đã bỏ email mà phiên trước gắn vào (assignedEmail và các ô email trùng nó).
 * Dữ liệu cũ trong danh sách đã dùng còn mang email phiên; tái dùng nguyên thì phiên mới điền lại email đó.
 *
 * @param {object} record Record trong hàng đợi.
 * @return {object|null} Bản sao sạch email phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function withoutSessionEmail(record) {
  const copy = safeCloneRecord(record);
  if (!copy || typeof copy !== 'object' || !copy.assignedEmail) return copy;
  for (const key of ['email', 'emailaddress', 'mail']) {
    if (copy[key] === copy.assignedEmail) delete copy[key];
  }
  delete copy.assignedEmail;
  return copy;
}
