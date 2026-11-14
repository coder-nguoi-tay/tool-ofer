/**
 * Ẩn/hiện ô chọn giờ khi người dùng bật/tắt checkbox hẹn giờ chạy của một offer.
 * @param {number} offerIndex Chỉ số offer (1, 2, 3, 4).
 * @param {boolean} checked Trạng thái bật/tắt hẹn giờ.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function toggleScheduleOffer(offerIndex, checked) {
  const timeInput = document.getElementById(`timeScheduleOffer${offerIndex}`);
  if (timeInput) {
    timeInput.style.display = checked ? 'inline-block' : 'none';
    if (checked && !timeInput.value) {
      timeInput.value = offerIndex === 1 ? '07:00' : offerIndex === 2 ? '08:00' : offerIndex === 3 ? '12:00' : '20:00';
    }
  }
}
