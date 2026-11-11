import { applicationState } from '../../runtime/application-state.mjs';
import { autofillRejectedPath } from '../../runtime/constants/autofill-rejected-path.mjs';
import { readFile } from 'node:fs/promises';

/**
 * Nạp danh sách record bị form từ chối.
 * @return {Promise<void>} Kết quả xử lý load autofill rejected.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function loadAutofillRejected() {
  try {
    const data = JSON.parse(await readFile(autofillRejectedPath, 'utf8'));
    applicationState.autofillRejectedKeys = new Set(Array.isArray(data.keys) ? data.keys : []);
  } catch {/* file chưa tồn tại */}
}
