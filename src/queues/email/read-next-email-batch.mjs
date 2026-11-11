import { emailAutoRefill } from './state/email-auto-refill.mjs';
import { emailQueue } from './state/email-queue.mjs';
import { readEmailBatchFromSource } from './read-email-batch-from-source.mjs';
import { saveEmailAutoRefillConfig } from './save-email-auto-refill-config.mjs';
import { saveEmailQueue } from './save-email-queue.mjs';

/**
 * Bổ sung một lô email và lưu vị trí đọc tiếp theo.
 * @return {Promise<number>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function readNextEmailBatch() {
  const {
    emails,
    newByteOffset
  } = await readEmailBatchFromSource(emailAutoRefill.sourcePath, emailAutoRefill.byteOffset, emailAutoRefill.batchSize);
  if (emails.length === 0) return 0;
  emailQueue.available.push(...emails);
  emailAutoRefill.byteOffset = newByteOffset;
  await saveEmailQueue();
  await saveEmailAutoRefillConfig();
  return emails.length;
}
export { readNextEmailBatch };
