const focusGuards = new WeakMap();

/**
 * Giữ đúng node trong suốt một lượt nhập, kể cả khi framework thay phần tử có cùng selector.
 * @param {object} field Locator hoặc handle của ô nhập.
 * @param {Function} operation Thao tác với phần tử đã cố định.
 * @return {Promise<*>} Kết quả thao tác, hoặc false khi không xác minh được phần tử.
 * @throws {Error} Truyền lỗi của thao tác sau khi giải phóng handle.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export async function withPinnedInput(field, operation) {
  if (!field) return false;
  if (focusGuards.has(field) || (!field.elementHandle && !field.ownerFrame)) return operation(field);
  const input = field.elementHandle ? await field.elementHandle({ timeout: 500 }).catch(() => null) : field;
  if (!input) return false;
  let guard;
  try {
    guard = await input.evaluateHandle(element => {
      let left = false;
      let editingEvent;
      const rememberKey = event => {
        if (left) event.preventDefault();
        else editingEvent = event;
      };
      const loseFocus = () => {
        left = true;
        // Nếu trang đổi focus ngay trong keydown, hủy cả thao tác chèn mặc định của phím đó.
        if (editingEvent?.eventPhase) editingEvent.preventDefault();
      };
      for (const type of ['keydown', 'keypress', 'beforeinput']) element.addEventListener(type, rememberKey, true);
      element.addEventListener('blur', loseFocus, true);
      return {
        focused: () => !left && element.isConnected && element.getRootNode().activeElement === element,
        left: () => left || !element.isConnected,
        release() {
          for (const type of ['keydown', 'keypress', 'beforeinput']) element.removeEventListener(type, rememberKey, true);
          element.removeEventListener('blur', loseFocus, true);
        },
      };
    }).catch(() => null);
    if (!guard) return false;
    focusGuards.set(input, guard);
    return await operation(input);
  } finally {
    focusGuards.delete(input);
    if (guard) {
      await guard.evaluate(state => state.release()).catch(() => {});
      await guard.dispose().catch(() => {});
    }
    if (input !== field) await input.dispose().catch(() => {});
  }
}

/**
 * Xác minh trang còn cho nhập vào chính phần tử đã chọn, hoặc chỉ kiểm tra ô chưa từng mất focus.
 * @param {object} field Handle được giữ trong lượt nhập.
 * @param {boolean} [beforeFocus] Cho phép phần tử chưa nhận focus lần đầu.
 * @return {Promise<boolean>} False khi phần tử bị thay thế, mất focus hoặc không đọc được.
 * @throws {never} Mất execution context được coi là kết thúc lượt nhập.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export async function retainsInputFocus(field, beforeFocus = false) {
  const guard = focusGuards.get(field);
  return !guard || guard.evaluate((state, initial) => initial ? !state.left() : state.focused(), beforeFocus).catch(() => false);
}
