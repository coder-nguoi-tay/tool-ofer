import { emailAutoRefill } from './state/email-auto-refill.mjs';
import { emailQueue } from './state/email-queue.mjs';
import { refillEmailBatchFromSource } from './refill-email-batch-from-source.mjs';

/**
 * Tự động nạp thêm email từ file nguồn khi hàng đợi cạn. Gọi bất đồng bộ, không block.
 * @return {Promise<void>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function autoRefillEmailIfNeeded() {
  if (!emailAutoRefill.enabled || !emailAutoRefill.sourcePath) return;
  if (emailQueue.available.length > 0) return;
  try {
    const added = await refillEmailBatchFromSource();
    if (added === 0) {
      console.log('[EmailAutoRefill] Đã đọc hết file nguồn.');
      return;
    }
    console.log(`[EmailAutoRefill] Đã nạp thêm ${added} email từ file nguồn.`);
  } catch (e) {
    console.log('[EmailAutoRefill] Lỗi đọc file nguồn:', e.message);
  }
}
export { autoRefillEmailIfNeeded };
