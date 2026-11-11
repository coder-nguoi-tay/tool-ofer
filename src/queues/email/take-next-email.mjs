import { autoRefillEmailIfNeeded } from './auto-refill-email-if-needed.mjs';
import { dequeueNextEmail } from './dequeue-next-email.mjs';
import { emailAutoRefill } from './state/email-auto-refill.mjs';

/**
 * Lấy email cho phiên; khi hàng đợi cạn và đang bật tự nạp thì chờ nạp xong lô mới rồi lấy,
 * thay vì trả null (phiên chạy không có email riêng, rơi về email cũ trong record).
 *
 * @return {Promise<string|null>} Email được gán hoặc null khi thật sự hết.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function takeNextEmail() {
  const email = dequeueNextEmail();
  if (email || !emailAutoRefill.enabled || !emailAutoRefill.sourcePath) return email;
  await autoRefillEmailIfNeeded();
  return dequeueNextEmail();
}
export { takeNextEmail };
