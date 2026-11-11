import { getAutoLeadPCDir } from '../paths.mjs';
import { join } from 'node:path';

/**
 * Xác định file cấu hình trợ lý AI.
 * @return {string} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getAiConfigFilePath() {
  return join(getAutoLeadPCDir(), 'Config', 'ai-config.json');
}
export { getAiConfigFilePath };
