import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { queueAutomaticRefill } from './queue-automatic-refill.mjs';
import { saveNoSlotRefillSettings } from './save-no-slot-refill-settings.mjs';

/**
 * Bật/tắt chế độ không bù slot mà không dừng các trình duyệt đang chạy.
 * @param {string} requestBody JSON chứa noSlotRefill dạng boolean.
 * @return {Promise<object>} Trạng thái mới và thông báo hiển thị.
 * @throws {Error} Khi noSlotRefill không phải boolean.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function updateNoSlotRefill(requestBody) {
  const body = JSON.parse(requestBody);
  if (typeof body.noSlotRefill !== 'boolean') throw new Error('Trạng thái không bù slot phải là true hoặc false.');
  autoRefill.noSlotRefill = body.noSlotRefill;
  autoRefill.message = body.noSlotRefill
    ? 'Đã bật Không bù slot; các trình duyệt đang mở vẫn tiếp tục chạy.'
    : 'Đã tắt Không bù slot; app có thể mở profile thay thế khi có slot trống.';
  await saveNoSlotRefillSettings();
  if (!body.noSlotRefill && autoRefill.enabled) queueAutomaticRefill();
  return {
    results: [autoRefill.message],
    warnings: [],
    noSlotRefill: autoRefill.noSlotRefill
  };
}
