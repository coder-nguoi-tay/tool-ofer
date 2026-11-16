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

/**
 * Ẩn/hiện ô chọn giờ tắt khi người dùng bật/tắt checkbox hẹn giờ tắt ("Chạy đến mấy giờ thì tắt").
 * @param {boolean} checked Trạng thái bật/tắt hẹn giờ tắt.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
function toggleScheduleStop(checked) {
  const cbx = document.getElementById('cbxScheduleStop');
  if (cbx && typeof checked === 'boolean' && cbx.checked !== checked) {
    cbx.checked = checked;
  }
  const timeInput = document.getElementById('timeScheduleStop');
  const hint = document.getElementById('lblScheduleStopHint');
  if (timeInput) {
    timeInput.style.display = checked ? 'inline-block' : 'none';
    if (checked && !timeInput.value) {
      timeInput.value = '23:00';
    }
  }
  if (hint) {
    hint.style.display = checked ? 'inline' : 'none';
  }
  try {
    localStorage.setItem('autoleadpc_schedule_stop', JSON.stringify({
      enabled: Boolean(checked),
      time: timeInput?.value || '23:00'
    }));
  } catch {}
  if (typeof syncStopSchedulerState === 'function') {
    syncStopSchedulerState();
  }
}
