let dashboardAiSave = null;

/**
 * Bật AI ngay từ lúc mở tab hoặc trả các tab đang chạy về autofill.
 * @param {boolean} checked Trạng thái checkbox trên giao diện Vận hành.
 * @return {Promise<void>} Kết thúc khi backend xác nhận hoặc UI khôi phục cấu hình đã lưu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function toggleAiAssistDashboard(checked) {
  const checkbox = document.getElementById('cbxAiAssist');
  const mode = checked ? 'form_agent' : 'disabled';
  checkbox.disabled = true;
  try {
    dashboardAiSave = api('/ai/config', { method: 'POST', body: JSON.stringify({ enabled: checked, mode }) });
    const result = await dashboardAiSave;
    if (!result?.success) throw new Error(result?.error || 'Lưu cấu hình AI thất bại');
    document.getElementById('cbbAiMode').value = mode;
    checkbox.indeterminate = false;
  } catch (error) {
    checkbox.checked = !checked;
    await loadAiConfigUi();
    showToast(error.message, 'error');
  } finally {
    dashboardAiSave = null;
    checkbox.disabled = false;
    syncOptionPills();
  }
}
