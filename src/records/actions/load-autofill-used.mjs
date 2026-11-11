import { applicationState } from '../../runtime/application-state.mjs';
import { autofillUsedPath } from '../../runtime/constants/autofill-used-path.mjs';
import { readFile } from 'node:fs/promises';

/**
 * Nạp danh sách bản ghi đã dùng từ file.
 * @return {Promise<void>} Kết quả xử lý load autofill used.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function loadAutofillUsed() {
  try {
    const data = JSON.parse(await readFile(autofillUsedPath, 'utf8'));
    applicationState.autofillUsedKeys = new Set(Array.isArray(data.keys) ? data.keys : []);
  } catch {/* file chưa tồn tại */}
}
