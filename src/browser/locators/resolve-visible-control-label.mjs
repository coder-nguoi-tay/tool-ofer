/**
 * Lấy nhãn đang hiển thị của checkbox/radio ẩn để rê chuột tới đúng vùng có thể bấm.
 * @param {object} locator Control có nhãn được kiểm tra bởi inspectInteractionReadiness.
 * @return {Promise<object|null>} Handle của nhãn; caller phải dispose sau thao tác.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function resolveVisibleControlLabel(locator) {
  try {
    return await locator.evaluateHandle(element => Array.from(element.labels || []).find(label => {
      for (let ancestor = label; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (ancestor.hidden || ancestor.hasAttribute('inert') || style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || style.opacity === '0') return false;
      }
      const bounds = label.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0;
    }), undefined, { timeout: 300 });
  } catch { return null; }
}
