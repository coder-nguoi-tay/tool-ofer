import { applicationState } from '../../runtime/application-state.mjs';

/**
 * Đặt lại bộ đếm xoay vòng thiết bị về 0 (phục vụ test).
 * @return {void} Kết quả xử lý reset device profile rotation.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function resetDeviceProfileRotation() {
  applicationState.deviceProfileRotationCounter = 0;
}
