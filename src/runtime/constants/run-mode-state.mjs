/**
 * Chế độ chạy của lần Start gần nhất. `manual` = "Làm thủ công": mở trình duyệt/proxy/link offer nhưng không autofill,
 * không AI; người dùng tự thao tác. Tự bù slot KHÔNG bị tắt: trình duyệt chết vẫn được thay và phiên bù cũng thủ công.
 * Mặc định false để mọi luồng cũ giữ nguyên.
 */
const runModeState = { manual: false };

/**
 * Áp chế độ chạy do UI gửi lên. Chỉ đúng chuỗi `manual` mới bật; giá trị lạ/thiếu là auto.
 * Mỗi lần Start/Tuần tự phải gọi để cờ không dính từ lần trước.
 *
 * @param {*} runMode Giá trị `runMode` từ UI (`auto` | `sequential` | `manual`).
 * @return {boolean} True nếu đang ở chế độ thủ công.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
function applyRunMode(runMode) {
  runModeState.manual = runMode === 'manual';
  return runModeState.manual;
}
export { runModeState, applyRunMode };
