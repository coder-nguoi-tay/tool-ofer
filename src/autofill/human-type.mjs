import { humanTypeMarked } from './human-type-marked.mjs';
import { pageTypingChains } from './state/page-typing-chains.mjs';

/**
 * Wrapper chống gõ đè (re-entry guard): đặt lock data-ux-typing (timestamp) lên ô
 * ngay khi bắt đầu gõ; vòng quét autofill sau sẽ bỏ qua ô đang gõ (lock tươi < 30s).
 * Lock cũ quá hạn được coi là vòng trước đã chết → cho phép gõ lại.
 * Fix lỗi ký tự lặp xen kẽ (wggcc556622mmaann@@...) khi nhịp gõ chậm vượt khoảng quét.
 *
 * @param {object} field Locator ô input cần gõ.
 * @param {string} text Nội dung cần gõ.
 * @param {object} [page=null] Trang Playwright chứa ô (fallback khi field không có page()).
 * @param {object} [options={}] Tùy chọn (simulateTypo, forceTypo, onLog).
 * @return {Promise<void>} Hoàn tất khi đã gõ xong toàn bộ nội dung.
 * @throws {Error} Lỗi gõ được nuốt bên trong humanTypeCore, không ném ra ngoài.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function humanType(field, text, page = null, options = {}) {
  // keyboard.type gõ vào ô đang focus của cả trang: hai lần gõ cùng lúc (lượt quét + AI Assist...) sẽ trộn chữ
  // vào một ô. Xếp hàng theo trang để gõ xong ô này mới click sang ô kia.
  const owner = page || (typeof field?.page === 'function' ? field.page() : null);
  if (!owner || typeof owner !== 'object') return humanTypeMarked(field, text, page, options);
  const previous = pageTypingChains.get(owner) ?? Promise.resolve();
  const current = previous.then(() => humanTypeMarked(field, text, page, options));
  pageTypingChains.set(owner, current.catch(() => {}));
  return current;
}
export { humanType };
