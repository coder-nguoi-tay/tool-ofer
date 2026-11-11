import { DEVICE_PROFILES } from '../../runtime/constants/device-profiles.mjs';
import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { deviceProfilesPath } from '../../runtime/constants/device-profiles-path.mjs';
import { readFile } from 'node:fs/promises';
import { seedFileIfMissing } from '../../storage/seed-data.mjs';

/**
 * Đọc cấu hình các profile thiết bị đã chọn từ đĩa.
 * @return {Promise<*>} Kết quả xử lý load saved device profiles.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function loadSavedDeviceProfiles() {
  await seedFileIfMissing(deviceProfilesPath, 'device-profiles.json');
  try {
    const raw = await readFile(deviceProfilesPath, 'utf8');
    const saved = JSON.parse(raw);
    if (Array.isArray(saved) && saved.length > 0) {
      const valid = saved.filter(id => DEVICE_PROFILES[id]);
      if (valid.length > 0) {
        autoRefill.deviceProfiles = valid;
        return valid;
      }
    }
  } catch {}
  return autoRefill.deviceProfiles;
}
