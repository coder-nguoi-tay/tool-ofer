import { launchAdsPowerBrowsers } from '../../browser/actions/launch-ads-power-browsers.mjs';
import { launchRequestedBrowsers } from '../../browser/actions/launch-requested-browsers.mjs';

/**
 * Bù slot bằng đúng engine của lượt Start, giữ nguyên mục tiêu và cấu hình ban đầu.
 * @param {string} requestBody JSON cấu hình phiên cùng số slot còn thiếu.
 * @param {object} options Layout và phân công offer đã được queue tính toán.
 * @return {Promise<object>} Kết quả launcher Chrome hoặc AdsPower hiện có.
 * @throws {Error} Lỗi launcher được queue xử lý theo cơ chế retry hiện tại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function launchRefillBrowsers(requestBody, options) {
  const settings = JSON.parse(requestBody);
  if (String(settings.browserMode || '').toLowerCase() === 'adspower' || settings.useAdsPower === true) {
    return launchAdsPowerBrowsers(requestBody, true, options.assignedStreamRoles);
  }
  return launchRequestedBrowsers(requestBody, options);
}
