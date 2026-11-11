import { emailAutoRefill } from './state/email-auto-refill.mjs';
import { emailAutoRefillConfigPath } from './state/email-auto-refill-config-path.mjs';
import { writeFile } from 'node:fs/promises';

/**
 * Lưu config auto-refill xuống file.
 * @return {Promise<void>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function saveEmailAutoRefillConfig() {
  await writeFile(emailAutoRefillConfigPath, JSON.stringify(emailAutoRefill)).catch(() => {});
}
export { saveEmailAutoRefillConfig };
