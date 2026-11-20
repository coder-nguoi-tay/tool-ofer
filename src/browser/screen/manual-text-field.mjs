/**
 * Giữ đúng phần tử người dùng vừa bấm để Mini gắn bản nháp với ô đó.
 * @param {Element} hit Phần tử tại tọa độ người dùng bấm trong frame.
 * @param {string} fieldId Mã của lần bấm.
 * @return {object|null} Nhãn và loại ô để hiển thị, hoặc null nếu ô không cho gõ.
 * @throws {Error} Khi cây DOM không thể đọc phần tử tại điểm bấm.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function captureManualTextField(hit, fieldId) {
  const field = hit.closest('input, textarea, [contenteditable]') || hit.closest('label')?.control;
  if (!field || field.matches(':disabled') || field.readOnly || field.closest('[inert]')) return null;
  const tag = field.localName;
  const type = field.isContentEditable ? 'contenteditable' : tag === 'textarea' ? 'textarea' : field.type;
  if (!/^(text|email|tel|number|password|search|url|textarea|contenteditable)$/.test(type)) return null;
  document[Symbol.for('autoleadpc.manualTextField')] = { fieldId, field, type };
  return { fieldId, tag, type, isTextLike: true, name: field.name || field.id || '',
    placeholder: field.getAttribute('placeholder') || field.getAttribute('aria-label') || field.name || '' };
}

/**
 * Kiểm tra ô của bản nháp còn nhận focus; chèn tại vùng chọn hiện tại trong cùng lượt xử lý DOM.
 * @param {{fieldId: string, probe?: boolean, text?: string}} command Mã lần bấm, chế độ kiểm tra focus hoặc văn bản cần chèn.
 * @return {object|boolean|Promise<boolean>|null} Đích nhận phím và hàm kết thúc, kết quả chèn chữ sau khi form cập nhật, hoặc null nếu đích đã đổi.
 * @throws {Error} Khi thao tác DOM hoặc sự kiện nhập liệu không thể thực hiện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function useFocusedManualTextField({ fieldId, probe = false, text }) {
  const target = document[Symbol.for('autoleadpc.manualTextField')];
  const field = target?.field;
  const canEdit = () => field && target.fieldId === fieldId && field.isConnected && document.hasFocus()
    && field.getRootNode().activeElement === field && !field.matches(':disabled') && !field.readOnly
    && !field.closest('[inert]') && target.type === (field.isContentEditable ? 'contenteditable' : field.type);
  if (!canEdit()) return null;
  if (probe) return true;
  if (text === undefined) {
    // ElementHandle.press có thể focus lại ô cũ giữa hai lệnh CDP.
    let lostFocus = false;
    let nextField;
    let receivedKey = false;
    const rememberBlur = event => {
      if (receivedKey || lostFocus) return;
      lostFocus = true;
      nextField = event.relatedTarget;
    };
    const guardKey = event => {
      if (!lostFocus && (receivedKey || (canEdit() && event.composedPath().includes(field)))) {
        if (event.type === 'keydown') receivedKey = true;
      } else {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    field.addEventListener('blur', rememberBlur, true);
    window.addEventListener('keydown', guardKey, true);
    window.addEventListener('keyup', guardKey, true);
    return { field, finish() {
      field.removeEventListener('blur', rememberBlur, true);
      window.removeEventListener('keydown', guardKey, true);
      window.removeEventListener('keyup', guardKey, true);
      if (lostFocus && nextField?.isConnected && field.getRootNode().activeElement === field) nextField.focus();
      return receivedKey;
    } };
  }
  // Chromium không phát beforeinput khi chèn bằng execCommand. Form có thể hủy hoặc đổi ô ngay trong sự kiện này.
  if (!field.dispatchEvent(new InputEvent('beforeinput', {
    inputType: 'insertText', data: text, bubbles: true, cancelable: true, composed: true,
  }))) return false;
  if (!canEdit()) return null;
  const start = field.selectionStart;
  const end = field.selectionEnd;
  const richText = target.type === 'contenteditable';
  const selection = document.getSelection?.();
  if (richText && (!selection?.rangeCount || !field.contains(selection.getRangeAt(0).commonAncestorContainer))) return false;
  const previous = richText ? field.innerText : field.value;
  const hasOffsets = Number.isInteger(start) && Number.isInteger(end);
  const selected = hasOffsets ? previous.slice(start, end) : selection?.toString() || '';
  // email, number và contenteditable có thể có con trỏ nhưng không có selectionStart.
  let expected = hasOffsets ? previous.slice(0, start) + text + previous.slice(end) : undefined;
  /**
   * Đối chiếu giá trị sau trình nghe input, kể cả form chuẩn hóa chữ hoặc thêm dấu phân nhóm số.
   * @param {string} editedValue Nội dung đầy đủ của lượt chỉnh sửa trước khi form định dạng.
   * @return {Promise<boolean>} Form giữ đủ nội dung sau các microtask đã xếp lúc xử lý input.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-20
   */
  const keptEdit = async editedValue => {
    await Promise.resolve();
    if (!field.isConnected || field.ownerDocument !== document) return false;
    const actual = richText ? field.innerText : field.value;
    if (actual === editedValue) return true;
    if (target.type === 'password' || typeof editedValue !== 'string') return false;
    const normalized = editedValue.normalize('NFC');
    const formatted = actual.normalize('NFC');
    if (normalized === formatted) return true;
    if (!['text', 'tel', 'search', 'textarea', 'contenteditable'].includes(target.type)) return false;
    if (normalized.toUpperCase() === formatted || normalized.toLowerCase() === formatted) return true;
    return /\d/.test(normalized) && /^[\d ()-]+$/.test(normalized) && /^[\d ()-]+$/.test(formatted)
      && normalized.replace(/[ ()-]/g, '') === formatted.replace(/[ ()-]/g, '');
  };
  const limit = field.getAttribute('maxlength');
  if (typeof previous === 'string' && /^\d+$/.test(limit)
      && previous.length - selected.length + text.length > Number(limit)) return false;
  if (target.type === 'number') {
    if (/[^0-9eE+.\-]/.test(text)) return false;
    if (!previous || previous === selected) {
      const numberCheck = document.createElement('input');
      numberCheck.type = 'number';
      numberCheck.value = text;
      if (!numberCheck.value) return false;
    }
  }
  if (!document.queryCommandSupported?.('insertText')) {
    // Engine không có lệnh chỉnh sửa. Chỉ sửa trực tiếp khi xác định được vùng chọn.
    if (typeof field.value !== 'string') return false;
    if (hasOffsets) field.setRangeText(text, start, end, 'end');
    else if (previous === selected) {
      field.value = text;
      if (field.value !== text) {
        field.value = previous;
        return false;
      }
      expected = text;
    } else return false;
    field.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true, composed: true }));
    return keptEdit(expected);
  }
  let inserted = false;
  const noteInput = event => {
    if (inserted || !event.composedPath().includes(field)) return;
    if (target.type === 'number' && field.validity?.badInput && previous) {
      field.value = previous;
      event.stopImmediatePropagation();
      return;
    }
    if (expected === undefined) {
      expected = richText ? field.innerText : field.value;
      if (expected === previous && selected !== text) return;
    }
    inserted = true;
  };
  window.addEventListener('input', noteInput, true);
  try {
    return document.execCommand('insertText', false, text) && inserted && keptEdit(expected);
  } finally {
    window.removeEventListener('input', noteInput, true);
  }
}

/**
 * Chuyển chữ hoặc phím từ hộp nhập Mini tới đúng node của lần bấm đã mở nó.
 * @param {object|null} control Thông tin phần tử đã chụp tại điểm bấm.
 * @param {object} command Lệnh nhập thủ công kèm mã ô.
 * @return {Promise<boolean|null>} True khi đã gửi, false khi trình duyệt từ chối, null khi mất đích nhập.
 * @throws {Error} Khi thao tác CDP hoặc kết nối frame gặp lỗi ngoài các lỗi đã xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function sendBoundManualFieldInput(control, command) {
  const { fieldId } = command;
  if (!fieldId || control?.input?.fieldId !== fieldId) return null;
  const { frame } = control;
  if (command.type === 'insertText') {
    return frame.evaluate(useFocusedManualTextField, { fieldId, text: command.text }).catch(() => null);
  }
  const guard = await frame.evaluateHandle(useFocusedManualTextField, { fieldId }).catch(() => null);
  if (!guard) return null;
  let handle;
  let accepted = false;
  let receivedKey;
  try {
    handle = await guard.evaluateHandle(state => state?.field);
    const field = handle.asElement();
    if (field) {
      await field.press(command.key);
      accepted = true;
    }
  } catch {
    return false;
  } finally {
    receivedKey = await guard.evaluate(state => state?.finish()).catch(() => false);
    await handle?.dispose().catch(() => {});
    await guard.dispose().catch(() => {});
  }
  return accepted && receivedKey ? true : null;
}
