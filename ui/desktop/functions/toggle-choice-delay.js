/**
 * Bật/tắt chế độ delay suy nghĩ trước khi chọn đáp án/kết quả.
 * Đồng bộ giữa checkbox ở thanh điều khiển và option-pill.
 *
 * @param {boolean} checked Trạng thái bật/tắt.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
function toggleChoiceDelay(checked) {
  const cb1 = document.getElementById('cbxChoiceDelay');
  const cb2 = document.getElementById('cbxChoiceDelayPill');
  const input = document.getElementById('nudChoiceDelay');
  const unit = document.getElementById('lblChoiceDelayUnit');
  const isChecked = Boolean(checked);
  if (cb1 && cb1.checked !== isChecked) cb1.checked = isChecked;
  if (cb2 && cb2.checked !== isChecked) cb2.checked = isChecked;
  if (input) input.style.display = isChecked ? 'inline-block' : 'none';
  if (unit) unit.style.display = isChecked ? 'inline-block' : 'none';
  try {
    localStorage.setItem('autoleadpc_enable_choice_delay', String(isChecked));
  } catch { }
  if (typeof syncOptionPills === 'function') {
    syncOptionPills();
  }
}
window.toggleChoiceDelay = toggleChoiceDelay;
