import { emailQueue } from './state/email-queue.mjs';
import { emailQueuePath } from './state/email-queue-path.mjs';
import { readFile } from 'node:fs/promises';
import { seedFileIfMissing } from '../../storage/seed-data.mjs';

/**
 * Nạp hàng đợi email mẫu từ file.
 * @return {Promise<void>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadEmailQueue() {
  await seedFileIfMissing(emailQueuePath, 'email-queue.json');
  try {
    const data = JSON.parse(await readFile(emailQueuePath, 'utf8'));
    emailQueue.available = Array.isArray(data.available) ? data.available : [];
    emailQueue.used = Array.isArray(data.used) ? data.used : [];
    emailQueue.rejected = Array.isArray(data.rejected) ? data.rejected : [];
  } catch {/* file chưa tồn tại */}
}
export { loadEmailQueue };
