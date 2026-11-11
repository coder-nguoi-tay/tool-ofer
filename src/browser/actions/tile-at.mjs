import { maximumWindow } from '../../runtime/constants/maximum-window.mjs';
import { minimumWindow } from '../../runtime/constants/minimum-window.mjs';

/**
 * Chia lưới vị trí cửa sổ cho N phiên trên màn hình hiện tại.
 *
 * @param {number} index Thứ tự cửa sổ, tính từ 0.
 * @param {number} total Tổng số cửa sổ.
 * @param {{width: number, height: number}} screen Kích thước màn hình.
 * @return {{left: number, top: number, width: number, height: number}} Ô lưới.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function tileAt(index, total, screen) {
  const columns = Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / columns);
  const cellWidth = Math.floor(screen.width / columns);
  const cellHeight = Math.floor(screen.height / rows);
  // Giới hạn cửa sổ đơn lẻ và căn giữa trong mỗi ô để các profile dùng chung màn hình.
  const width = Math.min(maximumWindow.width, Math.max(minimumWindow.width, cellWidth));
  const height = Math.min(maximumWindow.height, Math.max(minimumWindow.height, cellHeight));
  const cellLeft = index % columns * cellWidth;
  const cellTop = Math.floor(index / columns) * cellHeight;
  return {
    width,
    height,
    left: Math.max(0, Math.min(cellLeft + Math.floor((cellWidth - width) / 2), screen.width - width)),
    top: Math.max(0, Math.min(cellTop + Math.floor((cellHeight - height) / 2), screen.height - height))
  };
}
