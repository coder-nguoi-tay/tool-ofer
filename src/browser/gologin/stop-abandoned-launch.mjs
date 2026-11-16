/**
 * Slot GoLogin mở quá hạn bị bỏ: dừng luôn Orbita của lượt mở đó. Trước đây chỉ đặt cờ `abandoned`, mà cờ chỉ được kiểm
 * sau bước xác minh IP; bước đó treo (lệnh CDP không có timeout) thì Orbita chạy mồ côi mãi (log 2026-11-16: 45 phút,
 * app báo 0 trình duyệt). Dừng Orbita làm lệnh CDP đang treo lỗi theo, lượt mở đi vào nhánh lỗi và tự dọn profile/khoá.
 *
 * @param {{abandoned:boolean,startupSession?:object,stopRequested?:boolean}} attempt Lượt mở đã bị bỏ.
 * @return {Promise<boolean>} True nếu đã yêu cầu dừng Orbita; false nếu chưa có Orbita hoặc đã dừng trước đó.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
export async function stopAbandonedGoLoginLaunch(attempt) {
  const session = attempt?.startupSession;
  if (!attempt?.abandoned || attempt.stopRequested || typeof session?._stopProfile !== 'function') return false;
  attempt.stopRequested = true;
  try {
    session.addBrowserLog?.({ type: 'slot_launch_abandoned_stop', detail: 'Slot mở quá hạn đã bị bỏ: dừng Orbita của lượt mở này, không để chạy mồ côi.' });
    await session._stopProfile();
    return true;
  } catch { return false; }
}
