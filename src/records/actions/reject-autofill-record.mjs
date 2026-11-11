import { applicationState } from '../../runtime/application-state.mjs';
import { autofillQueue } from '../../runtime/constants/autofill-queue.mjs';
import { autofillRecordIdentity } from './autofill-record-identity.mjs';
import { autofillRejectedPath } from '../../runtime/constants/autofill-rejected-path.mjs';
import { saveAutofillQueue } from './save-autofill-queue.mjs';
import { writeFile } from 'node:fs/promises';

/**
 * Đánh dấu record bị form từ chối: bỏ khỏi hàng đợi (cả available lẫn used) để không bao giờ dùng lại.
 *
 * @param {object} record Bản ghi không qua được form.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function rejectAutofillRecord(record) {
  const id = autofillRecordIdentity(record);
  applicationState.autofillRejectedKeys.add(id);
  // Sửa tại chỗ (không gán mảng mới): các phiên đang chạy giữ tham chiếu tới autofillQueue.available.
  for (const list of [autofillQueue.available, autofillQueue.used]) {
    for (let i = list.length - 1; i >= 0; i -= 1) if (autofillRecordIdentity(list[i]) === id) list.splice(i, 1);
  }
  await saveAutofillQueue();
  await writeFile(autofillRejectedPath, JSON.stringify({
    keys: [...applicationState.autofillRejectedKeys]
  })).catch(() => {});
}
