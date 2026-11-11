/**
 * Tìm ô <select> dạng dropdown tại toạ độ click của Screen View. Popup native của select không có
 * trong ảnh screencast (nhất là khi chạy headless), nên Screen View tự hiện danh sách lựa chọn.
 * Select tìm thấy được gắn `data-ux-screen-select` để bước chọn sau tìm lại.
 *
 * @param {object} page Tab Playwright đang xem.
 * @param {number} x Toạ độ X (CSS px trong viewport).
 * @param {number} y Toạ độ Y (CSS px trong viewport).
 * @return {Promise<{frame: object, selectedIndex: number, options: {label: string, disabled: boolean}[]}|null>} Select tại điểm click, hoặc null.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function findSelectAtPoint(page, x, y) {
  let frame = page.mainFrame();
  let px = x;
  let py = y;
  // Đi xuống tối đa 3 tầng iframe: elementFromPoint ở frame cha chỉ trả về thẻ IFRAME.
  for (let depth = 0; depth < 3; depth++) {
    const el = (await frame.evaluateHandle(([cx, cy]) => document.elementFromPoint(cx, cy), [px, py])).asElement();
    if (!el) return null;
    const uid = String(Date.now());
    const info = await el.evaluate((node, selUid) => {
      if (node.tagName === 'IFRAME' || node.tagName === 'FRAME') {
        const r = node.getBoundingClientRect();
        return {
          iframe: true,
          left: r.left + node.clientLeft,
          top: r.top + node.clientTop
        };
      }
      const sel = node.closest('select');
      // Select dạng list (size > 1 / multiple) hiện ngay trong trang nên click thường vẫn chạy.
      if (!sel || sel.disabled || sel.multiple || sel.size > 1) return null;
      sel.setAttribute('data-ux-screen-select', selUid);
      sel.focus();
      return {
        selectedIndex: sel.selectedIndex,
        options: [...sel.options].map(o => ({
          label: (o.label || o.text || o.value).trim(),
          disabled: o.disabled
        }))
      };
    }, uid);
    if (!info?.iframe) return info ? {
      ...info,
      uid,
      frame
    } : null;
    frame = await el.contentFrame();
    if (!frame) return null;
    px -= info.left;
    py -= info.top;
  }
  return null;
}
