import { proxyQueue } from '../../runtime/constants/proxy-queue.mjs';
import { proxyQueuePath } from '../../runtime/constants/proxy-queue-path.mjs';
import { writeFile } from 'node:fs/promises';

/**
 * Lưu hàng đợi proxy xuống file.
 * @return {Promise<void>} Kết quả xử lý save proxy queue.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function saveProxyQueue() {
  await writeFile(proxyQueuePath, JSON.stringify(proxyQueue)).catch(() => {});
}
