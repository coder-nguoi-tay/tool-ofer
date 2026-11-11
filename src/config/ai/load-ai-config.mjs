import { existsSync } from 'node:fs';
import { getAiConfigFilePath } from './get-ai-config-file-path.mjs';
import { globalAiConfig } from '../../../ai-assist.mjs';
import { readFileSync } from 'node:fs';
import { setGlobalAiConfig } from '../../../ai-assist.mjs';

/**
 * Nạp cấu hình AI đã lưu vào cấu hình dùng chung.
 * @return {object} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function loadAiConfig() {
  try {
    const filePath = getAiConfigFilePath();
    if (existsSync(filePath)) {
      const data = JSON.parse(readFileSync(filePath, 'utf8'));
      setGlobalAiConfig(data);
      return data;
    }
  } catch {}
  return globalAiConfig;
}
export { loadAiConfig };
