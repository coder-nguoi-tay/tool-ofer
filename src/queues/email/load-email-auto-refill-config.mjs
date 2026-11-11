import { emailAutoRefill } from './state/email-auto-refill.mjs';
import { emailAutoRefillConfigPath } from './state/email-auto-refill-config-path.mjs';
import { readFile } from 'node:fs/promises';

/**
 * Nạp config auto-refill từ file.
 * @return {Promise<void>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadEmailAutoRefillConfig() {
  try {
    const data = JSON.parse(await readFile(emailAutoRefillConfigPath, 'utf8'));
    if (typeof data.enabled === 'boolean') emailAutoRefill.enabled = data.enabled;
    if (typeof data.sourcePath === 'string') emailAutoRefill.sourcePath = data.sourcePath;
    if (typeof data.batchSize === 'number') emailAutoRefill.batchSize = data.batchSize;
    if (typeof data.byteOffset === 'number') emailAutoRefill.byteOffset = data.byteOffset;
  } catch {/* chưa có config */}
}
export { loadEmailAutoRefillConfig };
