/**
 * Hiển thị các lựa chọn của ô đang được người dùng bấm trong Screen View.
 * @param {{uid: string, selectedIndex: number, options: Array<{label: string, disabled: boolean}>}} select Ô chọn do tab đang xem trả về.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function openSelectPicker(select) {
  const buttons = select.options.map((option, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'select-opt-item';
    button.disabled = Boolean(option.disabled);
    button.textContent = option.label || option.text || option.value || `Mục ${index + 1}`;
    if (index === select.selectedIndex) {
      button.classList.add('selected');
      const checkMark = document.createElement('span');
      checkMark.setAttribute('aria-hidden', 'true');
      checkMark.textContent = '✓';
      button.append(checkMark);
    }
    button.onclick = () => selectPickerOption(index, select.uid);
    return button;
  });
  selectModalOptions.replaceChildren(...buttons);
  selectModal.style.display = 'flex';
  try { tg?.HapticFeedback?.impactOccurred('medium'); } catch {}
}
