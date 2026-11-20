import { randomUUID } from 'node:crypto';
import { captureManualTextField } from './manual-text-field.mjs';

/**
 * Mở danh sách hoặc xác nhận lựa chọn trên ô đang hiển thị sau khi form xử lý input/change.
 * @param {Element} node Phần tử tại điểm bấm hoặc chính ô chọn đã mở.
 * @param {{uid: string, index?: number}} selection Mã lượt mở và vị trí trong danh sách hiển thị.
 * @return {Promise<object|boolean|null>} Thông tin frame/danh sách khi mở, trạng thái thành công khi chọn.
 * @throws {Error} Khi phần tử DOM hoặc danh sách chọn không còn khả dụng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function interactWithScreenSelect(node, { uid, index }) {
  if (node.tagName === 'IFRAME' || node.tagName === 'FRAME') {
    const rect = node.getBoundingClientRect();
    return {
      iframe: true,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      offsetWidth: node.offsetWidth,
      offsetHeight: node.offsetHeight,
      clientWidth: node.clientWidth,
      clientHeight: node.clientHeight,
      clientLeft: node.clientLeft,
      clientTop: node.clientTop,
    };
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
    const selectedOption = select.options[select.selectedIndex];
    return {
      selectedIndex: options.findIndex(entry => entry.option === selectedOption),
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
  const choice = options[index];
  if (select.options[select.selectedIndex] === choice.option) return true;
  const root = select.getRootNode();
  const ownerForm = select.form;
  const parent = select.parentElement;
  const { id, name } = select;
  const previousSelects = new Set(root.querySelectorAll('select'));
  select.selectedIndex = choice.option.index;
  select.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  if (select.isConnected) select.dispatchEvent(new Event('change', { bubbles: true }));

  // React/Vue có thể dựng lại ô ở microtask hoặc khung hình tiếp theo.
  await Promise.resolve();
  await new Promise(resolve => {
    if (document.visibilityState === 'hidden' || typeof requestAnimationFrame !== 'function') {
      setTimeout(resolve, 0);
      return;
    }
    const timeout = setTimeout(resolve, 80);
    requestAnimationFrame(() => { clearTimeout(timeout); resolve(); });
  });
  let current = select;
  if (!select.isConnected) {
    const replacements = Array.from(root.querySelectorAll('select')).filter(candidate => {
      if (candidate.form !== ownerForm) return false;
      if (id) return candidate.id === id && candidate.name === name;
      if (candidate.parentElement !== parent) return false;
      return name ? candidate.name === name : candidate.getAttribute('data-ux-screen-select') === uid;
    });
    if (replacements.length !== 1 || previousSelects.has(replacements[0])) return false;
    current = replacements[0];
  }
  if (current.getRootNode() !== root || current.form !== ownerForm || !current.getClientRects().length
      || getComputedStyle(current).visibility !== 'visible' || current.closest('[hidden]')) return false;
  const selected = current.options[current.selectedIndex];
  if (choice.option.closest('select') === current && selected !== choice.option) return false;
  return !!selected && selected.value === choice.value && (selected.label || selected.text || selected.value).trim() === choice.label;
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
export function findSelectAtPoint(page, x, y) {
  return findScreenControlAtPoint(page, x, y, false);
}

/**
 * Xác định ô chọn hoặc ô nhập tại điểm bấm trong đúng frame và shadow root.
 * @param {object} page Tab người dùng đang xem.
 * @param {number} x Tọa độ ngang theo viewport của trang.
 * @param {number} y Tọa độ dọc theo viewport của trang.
 * @param {boolean} includeTextField True khi thao tác có thể mở hộp gõ chữ.
 * @return {Promise<object|null>} Frame và dữ liệu hiển thị của ô tìm thấy.
 * @throws {Error} Khi trang hoặc frame đóng trong lúc xác định ô.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function findScreenControlAtPoint(page, x, y, includeTextField) {
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
      if (!info?.iframe) {
        if (info) return { ...info, uid, frame };
        const input = includeTextField && await element.evaluate(captureManualTextField, uid);
        return input ? { frame, input } : null;
      }
      frame = await element.contentFrame();
      if (!frame || !info.offsetWidth || !info.offsetHeight || !info.clientWidth || !info.clientHeight) return null;
      const frameViewport = await frame.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      const scaleX = info.width / info.offsetWidth;
      const scaleY = info.height / info.offsetHeight;
      if (!frameViewport.width || !frameViewport.height || !Number.isFinite(scaleX) || !Number.isFinite(scaleY)
          || scaleX <= 0 || scaleY <= 0) return null;
      frameX = ((frameX - info.left) / scaleX - info.clientLeft) * (frameViewport.width / info.clientWidth);
      frameY = ((frameY - info.top) / scaleY - info.clientTop) * (frameViewport.height / info.clientHeight);
    } finally {
      await hitHandle.dispose();
    }
  }
  return null;
}
