/**
 * Quản lý hẹn giờ tự động dừng luồng và đóng tất cả trình duyệt ở cấp máy chủ.
 * Đảm bảo tự động tắt đúng giờ ngay cả khi giao diện bị treo hoặc thu nhỏ trong nền.
 *
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */

let stopTimer = null;
let currentSchedule = null;

/**
 * Tính timestamp của mốc giờ tiếp theo (hôm nay hoặc ngày mai nếu giờ đã qua).
 *
 * @param {string} timeStr Chuỗi giờ định dạng HH:mm (ví dụ "23:00").
 * @return {number} Unix timestamp milliseconds.
 */
export function getNextStopScheduledTimestamp(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.split(':');
  const targetHour = parseInt(parts[0], 10) || 0;
  const targetMinute = parseInt(parts[1], 10) || 0;

  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), targetHour, targetMinute, 0, 0);

  // Nếu mốc hẹn đã qua hơn 30 giây trong ngày hôm nay, hẹn sang ngày mai
  if (target.getTime() <= now.getTime() - 30000) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

/**
 * Đọc cấu hình hẹn giờ tắt hiện tại của máy chủ.
 *
 * @return {{time: string, targetTimestamp: number}|null} Cấu hình đang chờ hoặc null.
 */
export function getAutoStopSchedule() {
  return currentSchedule;
}

/**
 * Đặt lịch hẹn giờ tự động dừng toàn bộ trình duyệt và auto-refill khi đến mốc giờ chỉ định.
 *
 * @param {string} timeStr Chuỗi giờ HH:mm (ví dụ "23:00").
 * @param {Function} stopFn Hàm dừng trình duyệt (mặc định closeActiveBrowsers).
 * @return {{time: string, targetTimestamp: number}|null} Thông tin lịch hẹn.
 */
export function scheduleAutoStop(timeStr, stopFn) {
  cancelAutoStop();
  if (!timeStr || typeof timeStr !== 'string') return null;

  const targetTimestamp = getNextStopScheduledTimestamp(timeStr);
  const now = Date.now();
  const delayMs = targetTimestamp - now;

  if (delayMs <= 0) return null;

  currentSchedule = {
    time: timeStr,
    targetTimestamp
  };

  const minutesLeft = Math.round(delayMs / 60000);
  console.log(`[AutoStop] Đã đặt hẹn giờ tự động tắt lúc ${timeStr} (sau ~${minutesLeft} phút).`);

  stopTimer = setTimeout(async () => {
    console.log(`[AutoStop] Đã đến giờ hẹn tắt (${timeStr})! Kiểm tra phiên có lead và dừng các phiên không lead.`);
    currentSchedule = null;
    stopTimer = null;
    if (typeof stopFn === 'function') {
      try {
        await stopFn({ preserveLeadSessions: true });
      } catch (err) {
        console.error('[AutoStop] Lỗi khi thực thi dừng trình duyệt:', err.message);
      }
    }
  }, delayMs);
  stopTimer?.unref?.();

  return currentSchedule;
}

/**
 * Hủy bỏ lịch hẹn giờ tự động tắt đang chờ.
 *
 * @return {void}
 */
export function cancelAutoStop() {
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  if (currentSchedule) {
    console.log(`[AutoStop] Đã hủy lịch hẹn giờ tự động tắt (${currentSchedule.time}).`);
    currentSchedule = null;
  }
}
