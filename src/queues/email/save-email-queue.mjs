import { emailQueue } from './state/email-queue.mjs';
import { emailQueuePath } from './state/email-queue-path.mjs';
import { writeFile } from 'node:fs/promises';

/**
 * Lưu hàng đợi email mẫu xuống file.
 * @return {Promise<void>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function saveEmailQueue() {
  await writeFile(emailQueuePath, JSON.stringify(emailQueue)).catch(() => {});
}
export { saveEmailQueue };
