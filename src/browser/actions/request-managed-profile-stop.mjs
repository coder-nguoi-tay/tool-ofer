/**
 * Dừng và xóa profile tạm của phiên trình duyệt được quản lý đúng một lần.
 *
 * @param {object} session Phiên AdsPower do app tạo.
 * @return {Promise<void>} Kết quả dừng profile đã được ghi log nếu thất bại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function requestManagedProfileStop(session) {
  if (!session._profileStopPromise) {
    session._profileStopPromise = (async () => {
      try {
        if (session._stopProfile) await session._stopProfile();
      } catch (error) {
        console.warn(`[AdsPower] Dừng profile ${session.profileId}: ${error.message}`);
      }
      // Giữ lại profile trong AdsPower để tái sử dụng (Profile Pool), không xóa để tránh chạm hạn ngạch daily import
      if (session._forceDeleteProfile && session._deleteProfile) {
        try {
          await session._deleteProfile();
          console.log(`[AdsPower] Đã xóa profile ${session.profileId} (Slot ${session.slot}) theo yêu cầu.`);
        } catch (error) {
          console.warn(`[AdsPower] Không xóa được profile ${session.profileId}: ${error.message}`);
        }
      }
    })();
  }
  return session._profileStopPromise;
}
