import { randomUUID } from 'node:crypto';

/**
 * Mở danh sách hiển thị hoặc áp dụng mục người dùng chọn trong cùng một lượt xử lý DOM.
 * @param {Element} node Phần tử tại điểm bấm hoặc chính ô chọn đã mở.
 * @param {{uid: string, index?: number}} selection Mã lượt mở và vị trí trong danh sách hiển thị.
 * @return {object|boolean|null} Thông tin frame/danh sách khi mở, trạng thái thành công khi chọn.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function interactWithScreenSelect(node, { uid, index }) {
  if (node.tagName === 'IFRAME' || node.tagName === 'FRAME') {
    const rect = node.getBoundingClientRect();
    return { iframe: true, left: rect.left + node.clientLeft, top: rect.top + node.clientTop };
  }
  const select = node.closest('select');
  if (!select || select.matches(':disabled') || select.multiple || select.size > 1) return null;
  if (index === undefined) select.focus();
  if (!select.isConnected || !select.getClientRects().length || getComputedStyle(select).visibility !== 'visible'
      || select.closest('[inert], [hidden]')) return null;

  const snapshotKey = Symbol.for('autoleadpc.screenSelect');
  const options = [];
  for (const option of select.options) {
    const group = option.closest('optgroup');
    if (option.hidden || group?.hidden || getComputedStyle(option).display === 'none'
        || getComputedStyle(option).visibility !== 'visible' || (group && getComputedStyle(group).display === 'none')) continue;
    options.push({ option, value: option.value, label: (option.label || option.text || option.value).trim(), disabled: option.matches(':disabled') });
  }
  if (index === undefined) {
    select.setAttribute('data-ux-screen-select', uid);
    document[snapshotKey] = { uid, select, options };
    return {
      selectedIndex: options.findIndex(entry => entry.option.selected),
      options: options.map(({ label, disabled }) => ({ label, disabled }))
    };
  }

  const opened = document[snapshotKey];
  if (opened?.uid !== uid || opened.select !== select || !options[index] || options[index].disabled
      || opened.options.length !== options.length) return false;
  const unchanged = options.every((current, position) => {
    const original = opened.options[position];
    return original.option === current.option && original.value === current.value
      && original.label === current.label && original.disabled === current.disabled;
  });
  if (!unchanged) return false;

  delete document[snapshotKey];
  const choice = options[index].option;
  if (!choice.selected) {
    select.selectedIndex = choice.index;
    select.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return select.options[select.selectedIndex] === choice && choice.value === options[index].value;
}

/**
 * Tìm dropdown HTML tại điểm người dùng bấm trong Screen View, kể cả trong iframe hoặc
 * Shadow DOM mở. Đánh dấu ô bằng mã riêng để khi chọn mục có thể kiểm tra đúng ô đã mở.
 *
 * @param {object} page Tab Playwright đang xem.
 * @param {number} x Toạ độ X (CSS px trong viewport).
 * @param {number} y Toạ độ Y (CSS px trong viewport).
 * @return {Promise<{frame: object, uid: string, selectedIndex: number, options: {label: string, disabled: boolean}[]}|null>} Dropdown có thể chọn hoặc null.
 * @throws {Error} Khi tab hoặc frame đóng hay chuyển trang trong lúc xác định ô.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function findSelectAtPoint(page, x, y) {
  let frame = page.mainFrame();
  let frameX = x;
  let frameY = y;
  const uid = randomUUID();
  while (frame) {
    const hitHandle = await frame.evaluateHandle(([clientX, clientY]) => {
      let hit = document.elementFromPoint(clientX, clientY);
      while (hit?.shadowRoot) {
        const innerHit = hit.shadowRoot.elementFromPoint?.(clientX, clientY);
        if (!innerHit || innerHit === hit) break;
        hit = innerHit;
      }
      return hit;
    }, [frameX, frameY]);
    try {
      const element = hitHandle.asElement();
      if (!element) return null;
      const info = await element.evaluate(interactWithScreenSelect, { uid });
      if (!info?.iframe) return info ? { ...info, uid, frame } : null;
      frame = await element.contentFrame();
      frameX -= info.left;
      frameY -= info.top;
    } finally {
      await hitHandle.dispose();
    }
  }
  return null;
}
