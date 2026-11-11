import { DEFAULT_LEAD_CONFIG } from '../../../lead-check.mjs';
import { toffersConfigPath } from './state/toffers-config-path.mjs';
import { writeFile } from 'node:fs/promises';

/**
 * Lưu thiết lập API Toffers để dùng khi khởi động lại.
 * @param {object} cfg Thiết lập API Toffers.
 * @return {Promise<void>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function saveToffersConfig(cfg = {}) {
  try {
    const data = {
      cookie: cfg.cookie || DEFAULT_LEAD_CONFIG.cookie,
      datas: cfg.datas || DEFAULT_LEAD_CONFIG.datas,
      pointUrl: cfg.pointUrl || DEFAULT_LEAD_CONFIG.pointUrl,
      apiUrl: cfg.apiUrl || DEFAULT_LEAD_CONFIG.apiUrl,
      updatedAt: new Date().toISOString()
    };
    await writeFile(toffersConfigPath, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
}
export { saveToffersConfig };
