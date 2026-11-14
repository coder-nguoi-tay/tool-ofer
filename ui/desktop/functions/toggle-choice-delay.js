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
  if (cb1 && cb1.checked !== checked) cb1.checked = checked;
  if (cb2 && cb2.checked !== checked) cb2.checked = checked;
  if (input) input.style.display = checked ? 'inline-block' : 'none';
  if (unit) unit.style.display = checked ? 'inline-block' : 'none';
}
window.toggleChoiceDelay = toggleChoiceDelay;
