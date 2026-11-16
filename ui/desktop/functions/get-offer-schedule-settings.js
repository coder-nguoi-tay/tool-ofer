/**
 * Đọc cấu hình hẹn giờ của 4 link offer trên giao diện.
 * @return {Array<{offerIndex: number, enabled: boolean, time: string}>} Danh sách hẹn giờ của các offer.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function getOfferScheduleSettings() {
  return [1, 2, 3, 4].map(idx => {
    const cbx = document.getElementById(`cbxScheduleOffer${idx}`);
    const timeInput = document.getElementById(`timeScheduleOffer${idx}`);
    const defaultTime = idx === 1 ? '07:00' : idx === 2 ? '08:00' : idx === 3 ? '12:00' : '20:00';
    return {
      offerIndex: idx,
      enabled: Boolean(cbx?.checked),
      time: timeInput?.value || defaultTime
    };
  });
}

/**
 * Đọc cấu hình hẹn giờ tắt ("Chạy đến mấy giờ thì tắt") trên giao diện.
 * @return {{enabled: boolean, time: string}} Cấu hình hẹn giờ tắt.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
function getScheduleStopSettings() {
  const cbx = document.getElementById('cbxScheduleStop');
  const timeInput = document.getElementById('timeScheduleStop');
  return {
    enabled: Boolean(cbx?.checked),
    time: timeInput?.value || '23:00'
  };
}
