import { autoRefillEmailIfNeeded } from './auto-refill-email-if-needed.mjs';
import { emailAutoRefill } from './state/email-auto-refill.mjs';
import { emailQueue } from './state/email-queue.mjs';
import { normalizeQueueEmail } from './normalize-queue-email.mjs';
import { saveEmailQueue } from './save-email-queue.mjs';

/**
 * Cấp email tiếp theo, loại email không hợp lệ và quay vòng khi được phép.
 * @return {string|null} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function dequeueNextEmail() {
  if (emailQueue.available.length === 0 && emailQueue.used.length > 0 && !emailAutoRefill.enabled) {
    console.log('[EmailQueue] Hàng đợi email mẫu đã hết, tự động quay vòng danh sách đã dùng.');
    emailQueue.available.push(...emailQueue.used.splice(0));
    void saveEmailQueue();
  }
  if (emailQueue.available.length === 0) {
    void autoRefillEmailIfNeeded();
    return null;
  }
  // Email form đã từ chối (emailQueue.rejected) không bao giờ được cấp lại, kể cả khi quay vòng danh sách đã dùng.
  const rejected = new Set(emailQueue.rejected.map(e => String(e).toLowerCase()));
  emailQueue.available = emailQueue.available.filter(e => !rejected.has(String(e).toLowerCase()));
  if (emailQueue.available.length === 0) {
    void autoRefillEmailIfNeeded();
    return null;
  }
  // Bỏ qua (và đưa vào danh sách bị từ chối) dòng email hỏng trong danh sách, ví dụ "x@gmail.com_old",
  // "x@gmail.com17650076"; dòng "email|mật khẩu" thì chỉ lấy phần email.
  let email = null;
  while (emailQueue.available.length > 0 && !email) {
    const raw = emailQueue.available.shift();
    const cleaned = normalizeQueueEmail(raw);
    if (cleaned) {
      email = cleaned;
    } else {
      console.log(`[EmailQueue] Bỏ email không hợp lệ trong danh sách: ${raw}`);
      if (!emailQueue.rejected.includes(raw)) emailQueue.rejected.push(raw);
    }
  }
  if (!email) {
    void saveEmailQueue();
    void autoRefillEmailIfNeeded();
    return null;
  }
  emailQueue.used.push(email);
  void saveEmailQueue();
  if (emailQueue.available.length === 0) void autoRefillEmailIfNeeded();
  return email;
}
export { dequeueNextEmail };
