/**
 * Kiểm tra ô thumbnail có giao với viewport và vùng cuộn của các phần tử cha hay không.
 * @param {HTMLElement} tile Ô trình duyệt cần kiểm tra.
 * @return {boolean} True khi người dùng có thể nhìn thấy một phần của ô.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
function _isThumbnailVisible(tile) {
  if (!tile.isConnected || !tile.getClientRects().length) return false;
  const bounds = tile.getBoundingClientRect();
  let top = Math.max(0, bounds.top);
  let bottom = Math.min(window.innerHeight, bounds.bottom);
  let left = Math.max(0, bounds.left);
  let right = Math.min(window.innerWidth, bounds.right);
  for (let parent = tile.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const clip = parent.getBoundingClientRect();
    if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
      top = Math.max(top, clip.top);
      bottom = Math.min(bottom, clip.bottom);
    }
    if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
      left = Math.max(left, clip.left);
      right = Math.min(right, clip.right);
    }
  }
  return bottom > top && right > left;
}
