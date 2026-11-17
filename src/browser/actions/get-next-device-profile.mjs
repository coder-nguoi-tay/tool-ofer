import { applicationState } from '../../runtime/application-state.mjs';
import { autoRefill } from '../../runtime/constants/auto-refill.mjs';

/**
 * Xoay nhóm thiết bị trong lựa chọn của người dùng, tránh nhóm vừa đóng nếu có lựa chọn khác.
 * @param {string|null} previousProfile Nhóm thiết bị trước của slot cần bù.
 * @return {string} Nhóm thiết bị hợp lệ tiếp theo; giữ nhóm duy nhất nếu chỉ chọn một nhóm.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
export function getNextDeviceProfile(previousProfile = null) {
  const profiles = autoRefill.deviceProfiles?.length > 0 ? autoRefill.deviceProfiles : ['windows'];
  for (let attempt = 0; attempt < profiles.length; attempt++) {
    const profile = profiles[applicationState.deviceProfileRotationCounter % profiles.length];
    applicationState.deviceProfileRotationCounter += 1;
    if (profile !== previousProfile || attempt === profiles.length - 1) return profile;
  }
}
