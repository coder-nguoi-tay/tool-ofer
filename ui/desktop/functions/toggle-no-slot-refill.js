/**
 * Cập nhật chế độ không bù slot ngay trên server và giữ các phiên đang chạy.
 * @param {boolean} checked True để không mở slot thay thế.
 * @return {Promise<void>} Hoàn tất đồng bộ checkbox với trạng thái server.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function toggleNoSlotRefill(checked) {
  const checkbox = document.getElementById('cbxNoSlotRefill');
  if (!checkbox || checkbox.disabled) return;
  checkbox.disabled = true;
  try {
    const result = await api('/auto-refill/no-slot-refill', {
      method: 'POST',
      body: JSON.stringify({ noSlotRefill: checked })
    });
    if (result?.error) throw new Error(result.error);
    checkbox.checked = result.noSlotRefill === true;
    showToast(checkbox.checked ? 'Đã bật Không bù slot' : 'Đã cho phép bù slot trở lại');
  } catch (error) {
    checkbox.checked = !checked;
    showWinAlert('Không cập nhật được chế độ bù slot: ' + (error?.message || error));
  } finally {
    checkbox.disabled = false;
    syncOptionPills();
  }
}
