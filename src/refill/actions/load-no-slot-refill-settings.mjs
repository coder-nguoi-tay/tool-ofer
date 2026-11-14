import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { noSlotRefillSettingsPath } from '../../runtime/constants/no-slot-refill-settings-path.mjs';
import { readFile } from 'node:fs/promises';

/**
 * Khôi phục tùy chọn không tự bù slot; mặc định tắt khi chưa có cấu hình hợp lệ.
 * @return {Promise<void>} Hoàn tất nạp trạng thái vào singleton autoRefill.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function loadNoSlotRefillSettings() {
  try {
    const raw = JSON.parse(await readFile(noSlotRefillSettingsPath, 'utf8'));
    autoRefill.noSlotRefill = raw.noSlotRefill === true;
  } catch {
    autoRefill.noSlotRefill = false;
  }
}
