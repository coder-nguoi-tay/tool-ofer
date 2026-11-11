import { applicationState } from '../../runtime/application-state.mjs';
import { autofillRecordKey } from './autofill-record-key.mjs';
import { autofillUsedPath } from '../../runtime/constants/autofill-used-path.mjs';
import { writeFile } from 'node:fs/promises';

/**
 * Ghi thêm một bản ghi vào danh sách đã dùng.
 * @param {object} record record.
 * @return {Promise<void>} Kết quả xử lý mark autofill record used.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function markAutofillRecordUsed(record) {
  applicationState.autofillUsedKeys.add(autofillRecordKey(record));
  await writeFile(autofillUsedPath, JSON.stringify({
    keys: [...applicationState.autofillUsedKeys]
  })).catch(() => {});
}
