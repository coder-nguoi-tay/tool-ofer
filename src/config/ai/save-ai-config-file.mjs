import { dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { getAiConfigFilePath } from './get-ai-config-file-path.mjs';
import { mkdirSync } from 'node:fs';
import { setGlobalAiConfig } from '../../../ai-assist.mjs';
import { writeFileSync } from 'node:fs';

/**
 * Lưu cấu hình AI và cập nhật cấu hình dùng chung.
 * @param {object} cfg Cấu hình trợ lý AI.
 * @return {object} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function saveAiConfigFile(cfg) {
  try {
    const filePath = getAiConfigFilePath();
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, {
        recursive: true
      });
    }
    setGlobalAiConfig(cfg);
    writeFileSync(filePath, JSON.stringify(cfg, null, 2), 'utf8');
    return {
      success: true
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}
export { saveAiConfigFile };
