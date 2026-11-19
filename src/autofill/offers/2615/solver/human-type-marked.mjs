// Bản giải riêng của offer 2615, chép từ src/autofill/human-type-marked.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
import { withPinnedInput } from '../../../interaction/focused-input.mjs';
import { humanTypeCore } from './human-type-core.mjs';

/**
 * Gắn khóa chống gõ chồng lên đúng phần tử trong suốt lượt nhập.
 * @param {object} field Locator của ô được chọn.
 * @param {string} text Nội dung cần điền.
 * @param {object} page Tab sở hữu ô nhập.
 * @param {object} options Chính sách tương tác của phiên.
 * @return {Promise<void|false>} Hoàn tất hoặc dừng nếu ô đã bị thay thế.
 * @throws {Error} Khi thao tác nhập thất bại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function humanTypeMarked(field, text, page = null, options = {}) {
  const owner = page || field?.page?.();
  return withPinnedInput(field, async input => {
    let marked = false;
    try {
      await input?.evaluate?.(el => {
        el.dataset.uxTyping = String(Date.now());
      });
      marked = true;
    } catch {}
    try {
      return await humanTypeCore(input, text, owner, options);
    } finally {
      if (marked) {
        try {
          await input?.evaluate?.(el => {
            el.removeAttribute('data-ux-typing');
          });
        } catch {}
      }
    }
  });
}
export { humanTypeMarked };
