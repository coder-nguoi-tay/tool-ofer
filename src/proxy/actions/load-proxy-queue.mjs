import { proxyQueue } from '../../runtime/constants/proxy-queue.mjs';
import { proxyQueuePath } from '../../runtime/constants/proxy-queue-path.mjs';
import { readFile } from 'node:fs/promises';
import { seedFileIfMissing } from '../../storage/seed-data.mjs';

/**
 * Nạp hàng đợi proxy từ file.
 * @return {Promise<void>} Kết quả xử lý load proxy queue.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function loadProxyQueue() {
  await seedFileIfMissing(proxyQueuePath, 'proxy-queue.json');
  try {
    const data = JSON.parse(await readFile(proxyQueuePath, 'utf8'));
    proxyQueue.available = Array.isArray(data.available) ? data.available : [];
    proxyQueue.used = Array.isArray(data.used) ? data.used : [];
  } catch {/* file chưa tồn tại */}
}
