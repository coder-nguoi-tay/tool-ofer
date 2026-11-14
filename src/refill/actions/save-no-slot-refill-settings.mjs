import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { noSlotRefillSettingsPath } from '../../runtime/constants/no-slot-refill-settings-path.mjs';
import { writeFile } from 'node:fs/promises';

/**
 * Lưu tùy chọn không bù slot độc lập với cấu hình chạy bị xóa khi Stop.
 * @return {Promise<void>} Hoàn tất ghi cấu hình; lỗi ghi không làm đổi trạng thái runtime.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function saveNoSlotRefillSettings() {
  try {
    await writeFile(noSlotRefillSettingsPath, JSON.stringify({ noSlotRefill: autoRefill.noSlotRefill === true }), 'utf8');
  } catch {}
}
