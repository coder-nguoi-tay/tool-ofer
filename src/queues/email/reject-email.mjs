import { emailQueue } from './state/email-queue.mjs';
import { saveEmailQueue } from './save-email-queue.mjs';

/**
 * Loại email bị form từ chối khỏi các danh sách có thể cấp lại.
 * @param {string} email Email bị từ chối.
 * @return {void} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function rejectEmail(email) {
  if (!email) return;
  const key = String(email).toLowerCase();
  emailQueue.available = emailQueue.available.filter(e => String(e).toLowerCase() !== key);
  emailQueue.used = emailQueue.used.filter(e => String(e).toLowerCase() !== key);
  if (!emailQueue.rejected.some(e => String(e).toLowerCase() === key)) emailQueue.rejected.push(email);
  void saveEmailQueue();
}
export { rejectEmail };
