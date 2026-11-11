/**
 * Mở DevTools của tab đang xem; engine không có cửa sổ inspector thì hiện bảng HTML trong app.
 * @return {Promise<void>} Hoàn tất yêu cầu debug từ F12 hoặc nút DevTools.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
async function _openScreenDevtools() {
  if (!_screenActiveSlot || _openScreenDevtools.pending) return;
  const slot = _screenActiveSlot;
  _openScreenDevtools.pending = true;
  try {
    await _openScreenHtml();
    if (_screenActiveSlot !== slot) return;
    const response = await fetch(`/screen/devtools/${slot}`, { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    if (result.mode === 'native') showToast('Đã mở DevTools của tab đang xem, chọn Elements để Copy outerHTML.', 'success');
  } catch (error) { showToast(error.message || 'Không mở được DevTools.', 'error'); }
  finally { _openScreenDevtools.pending = false; }
}
