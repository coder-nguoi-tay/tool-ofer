import { autofillQueue } from '../../runtime/constants/autofill-queue.mjs';
import { autofillQueuePath } from '../../runtime/constants/autofill-queue-path.mjs';
import { writeFile } from 'node:fs/promises';

/**
 * Lưu hàng đợi autofill xuống file.
 * @return {Promise<void>} Kết quả xử lý save autofill queue.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function saveAutofillQueue() {
  await writeFile(autofillQueuePath, JSON.stringify(autofillQueue)).catch(() => {});
}
