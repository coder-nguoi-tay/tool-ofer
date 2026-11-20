/**
 * Đóng hộp nhập và kết thúc lượt sửa để phản hồi cũ không tác động tới lượt mới.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
window.closeTypeModal = () => {
  miniTextDialog = {};
  const modal = document.getElementById('typeModal');
  if (modal) modal.style.display = 'none';
  const input = document.getElementById('modalTextInput');
  if (input) input.value = '';
};
