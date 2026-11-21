let miniTextDialog = {};

/**
 * Khóa bản nháp, lựa chọn cột và thao tác điều hướng khi tab đang nhận dữ liệu.
 * @param {HTMLInputElement} input Ô nhập của Mini đang hiển thị.
 * @param {boolean} submitting Tab đang xử lý lần gửi hiện tại.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function setMiniDraftSubmitting(input, submitting) {
  miniTextDialog.submitting = submitting;
  input.readOnly = submitting;
  for (const button of document.querySelectorAll('#btnModalSendText, #modalTextActions button')) button.disabled = submitting;
  const picker = document.getElementById('modalRecordField');
  if (picker) {
    picker.disabled = submitting;
    document.getElementById('btnModalInsertRecord').disabled = submitting || !picker.value;
  }
}

/**
 * Mở ô nhập nội dung muốn chèn tại vị trí con trỏ trong tab đang xem.
 * @param {{fieldId: string, type?: string, placeholder?: string, name?: string, recordFields?: string[]}} [info] Ô vừa chạm và tên cột được cấp cho ô đó.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
window.openTypeModal = (info) => {
  const modal = document.getElementById('typeModal');
  const input = document.getElementById('modalTextInput');
  const screenSourceId = canvas.dataset.screenSourceId;
  if (!screenSourceId || !modal || !input) return;
  const target = { screenSourceId };
  if (info) {
    if (!info.fieldId) { showToast('Chưa xác định được ô nhập. Hãy chạm lại vào ô.'); return; }
    target.fieldId = info.fieldId;
  }
  miniTextDialog = { target };
  const picker = document.getElementById('modalRecordField');
  if (picker) {
    const fields = info?.recordFields || [];
    picker.replaceChildren();
    if (fields.length) {
      picker.add(new Option('Chọn cột hồ sơ', ''));
      for (const key of fields) picker.add(new Option(key, key));
    }
    document.getElementById('modalRecordPicker').hidden = !fields.length;
  }
  setMiniDraftSubmitting(input, false);
  input.type = info?.type === 'password' ? 'password' : 'text';
  input.value = '';
  const fieldName = info?.placeholder || info?.name;
  input.placeholder = fieldName ? `Nội dung cần chèn vào ${fieldName}` : 'Nội dung cần chèn tại con trỏ';
  modal.style.display = 'flex';
  input.focus();
  try { tg?.HapticFeedback?.selectionChanged(); } catch {}
};
