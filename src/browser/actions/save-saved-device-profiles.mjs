import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { deviceProfilesPath } from '../../runtime/constants/device-profiles-path.mjs';
import { dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';

/**
 * Lưu cấu hình các profile thiết bị đã chọn vào đĩa.
 * @return {Promise<void>} Kết quả xử lý save saved device profiles.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function saveSavedDeviceProfiles() {
  try {
    await mkdir(dirname(deviceProfilesPath), {
      recursive: true
    });
    await writeFile(deviceProfilesPath, JSON.stringify(autoRefill.deviceProfiles, null, 2), 'utf8');
  } catch (error) {
    console.error(`[DeviceProfiles] Không thể lưu cấu hình thiết bị: ${error.message}`);
  }
}
