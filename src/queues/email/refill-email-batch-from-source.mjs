import { moduleState } from './state/module-state.mjs';
import { readNextEmailBatch } from './read-next-email-batch.mjs';

/**
 * Đọc một lô email (batchSize) từ file nguồn tại vị trí đang nhớ, cộng thêm vào hàng đợi và lưu vị trí mới.
 *
 * @return {Promise<number>} Số email mới đã nạp; 0 khi đã đọc hết file.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function refillEmailBatchFromSource() {
  // Một lần nạp mỗi lúc: hai lần chạy song song đọc cùng byteOffset sẽ đẩy trùng một lô email vào hàng đợi.
  moduleState.emailRefillInFlight ??= readNextEmailBatch().finally(() => {
    moduleState.emailRefillInFlight = null;
  });
  return moduleState.emailRefillInFlight;
}
export { refillEmailBatchFromSource };
