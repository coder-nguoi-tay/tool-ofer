import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { autoRefillSettingsPath } from '../../runtime/constants/auto-refill-settings-path.mjs';
import { readFile } from 'node:fs/promises';

/**
 * Khôi phục cấu hình tự bù; bỏ qua cấu hình GoLogin cũ sau khi chuyển sang AdsPower.
 *
 * @return {Promise<void>} Hoàn tất nạp cấu hình tương thích.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function loadAutoRefillSettings() {
  try {
    const raw = JSON.parse(await readFile(autoRefillSettingsPath, 'utf8'));
    if (raw?.settings) {
      if (raw.settings.browserMode === 'Gologin') {
        autoRefill.message = 'Cấu hình GoLogin cũ đã bỏ qua; hãy chọn AdsPower và bấm Start.';
        return;
      }
      autoRefill.settings = raw.settings;
      autoRefill.targetCount = raw.targetCount || 1;
      autoRefill.sequential = raw.sequential || false;
      autoRefill.message = 'Đã khôi phục cấu hình sau restart; đang bù slot...';
    }
  } catch {}
}
