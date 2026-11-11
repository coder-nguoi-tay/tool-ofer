import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { maxAliveBrowsers } from '../../runtime/constants/max-alive-browsers.mjs';
import { queueAutomaticRefill } from './queue-automatic-refill.mjs';
import { saveAutoRefillSettings } from './save-auto-refill-settings.mjs';

/**
 * Bật hoặc tắt việc tự mở profile thay thế khi cửa sổ bị đóng.
 *
 * @param {string} requestBody JSON có thuộc tính enabled dạng boolean.
 * @return {object} Trạng thái tự bù mới.
 * @throws {Error} Khi yêu cầu không có enabled dạng boolean.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function updateAutoRefill(requestBody) {
  const body = JSON.parse(requestBody);
  if (typeof body.enabled !== 'boolean') throw new Error('Trạng thái tự bù phải là true hoặc false.');
  autoRefill.enabled = body.enabled;
  if (!body.enabled) {
    autoRefill.sequential = false;
    autoRefill.settings = null;
    autoRefill.targetCount = 0;
    autoRefill.queued = false;
  } else if (body.targetCount > 0) {
    autoRefill.targetCount = Math.min(body.targetCount, maxAliveBrowsers);
    void saveAutoRefillSettings();
  }
  autoRefill.message = autoRefill.enabled ? 'Đã bật tự bù; app sẽ mở profile khác khi có slot trống.' : 'Đã tắt tự bù; các trình duyệt đang mở vẫn tiếp tục chạy.';
  if (autoRefill.enabled) queueAutomaticRefill();
  return {
    results: [autoRefill.message],
    warnings: [],
    autoRefillEnabled: autoRefill.enabled
  };
}
