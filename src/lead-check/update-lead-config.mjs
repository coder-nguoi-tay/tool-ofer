import { DEFAULT_LEAD_CONFIG } from './state/default-lead-config.mjs';

/**
 * Cập nhật cấu hình mặc định (Cookie, datas, URL) cho việc kiểm tra lead.
 *
 * @param {object} partialConfig Cấu hình cần ghi đè.
 * @return {object} Đối tượng DEFAULT_LEAD_CONFIG đã cập nhật.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function updateLeadConfig(partialConfig = {}) {
  Object.assign(DEFAULT_LEAD_CONFIG, partialConfig);
  return DEFAULT_LEAD_CONFIG;
}
export { updateLeadConfig };
