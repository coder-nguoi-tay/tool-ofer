import { applicationState } from '../../runtime/application-state.mjs';
import { autoRefill } from '../../runtime/constants/auto-refill.mjs';

/**
 * Lấy profile thiết bị tiếp theo theo vòng tròn xoay vòng toàn cục.
 * @return {*} Kết quả xử lý get next device profile.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function getNextDeviceProfile() {
  const profiles = autoRefill.deviceProfiles?.length > 0 ? autoRefill.deviceProfiles : ['windows'];
  const profile = profiles[applicationState.deviceProfileRotationCounter % profiles.length];
  applicationState.deviceProfileRotationCounter += 1;
  return profile;
}
