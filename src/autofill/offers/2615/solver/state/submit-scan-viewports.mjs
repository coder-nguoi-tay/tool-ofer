// Bản giải riêng của offer 2615, chép từ src/autofill/state/submit-scan-viewports.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
/**
 * Chiều cao vùng quét nút gửi, tính theo số lần `innerHeight` kể từ đỉnh trang (1 = chỉ màn hình đầu tiên).
 * Nút nằm ngoài vùng này (footer, link cuối trang...) bị bỏ qua.
 *
 * @type {number}
 */
const SUBMIT_SCAN_VIEWPORTS = 1;
export { SUBMIT_SCAN_VIEWPORTS };
