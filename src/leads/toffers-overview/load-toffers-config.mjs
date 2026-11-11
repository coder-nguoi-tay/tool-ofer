import { readFile } from 'node:fs/promises';
import { toffersConfigPath } from './state/toffers-config-path.mjs';
import { updateLeadConfig } from '../../../lead-check.mjs';

/**
 * Khôi phục thiết lập API Toffers đã lưu.
 * @return {Promise<void>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadToffersConfig() {
  try {
    const raw = JSON.parse(await readFile(toffersConfigPath, 'utf8'));
    if (raw && typeof raw === 'object') {
      if (raw.cookie) updateLeadConfig({
        cookie: raw.cookie
      });
      if (raw.datas) updateLeadConfig({
        datas: raw.datas
      });
      if (raw.pointUrl) updateLeadConfig({
        pointUrl: raw.pointUrl
      });
      if (raw.apiUrl) updateLeadConfig({
        apiUrl: raw.apiUrl
      });
    }
  } catch {}
}
export { loadToffersConfig };
