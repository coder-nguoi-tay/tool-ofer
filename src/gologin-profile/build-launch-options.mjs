/**
 * Áp dụng chạy trong app từ lúc Orbita spawn, không chờ kiểm tra IP mới ẩn cửa sổ.
 * @param {object} options Lựa chọn chạy trong app hoặc ẩn tới target/lead; mobileScreen là màn hình điện thoại (Android).
 * @return {object} Tùy chọn constructor SDK với tham số Orbita tương ứng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
// Đo trên Orbita thật: giảm ~6% RAM/phiên (436 → 410 MB), trang không thấy khác biệt.
// Không dùng --js-flags=--max-old-space-size: trang đọc được performance.memory.jsHeapSizeLimit (352 MB thay vì 4192 MB).
const MEMORY_SAVING_PARAMS = ['--renderer-process-limit=2'];
// Tắt lưu lượng nền của trình duyệt đi qua proxy (đo trên Orbita thật): trình cập nhật thành phần tải 0,15–2,4 MB mỗi
// profile mới, cộng autofill/Optimization Hints/ping của Google. Trang web không thấy khác biệt (UA/Client Hints/heap giữ nguyên).
// Không dùng --no-pings: chặn <a ping> khi click link, tracking affiliate có thể mất ghi nhận click và Chrome thật luôn gửi ping.
const BANDWIDTH_SAVING_PARAMS = ['--disable-background-networking', '--disable-component-update', '--disable-domain-reliability',
  '--disable-features=AutofillServerCommunication,OptimizationHints,MediaRouter,Translate'];
// Như Chrome: WebRTC chỉ dùng UDP qua proxy. Không có cờ này Orbita vẫn gửi STUN bằng UDP thẳng từ Mac (UDP không đi qua
// proxy HTTP được) rồi chỉ thay IP trong chuỗi ICE; trang tự dựng máy chủ STUN vẫn thấy IP thật của Mac.
const PRIVACY_PARAMS = ['--webrtc-ip-handling-policy=disable_non_proxied_udp'];
const SAVING_PARAMS = [...MEMORY_SAVING_PARAMS, ...BANDWIDTH_SAVING_PARAMS, ...PRIVACY_PARAMS];

export function buildGoLoginLaunchOptions({ screenPreviewOnly, hideUntilTarget, hideUntilLead, mobileScreen }) {
  const screen = mobileScreen ? { mobileScreen } : {};
  if (screenPreviewOnly) return { ...screen, extra_params: ['--headless=new', ...SAVING_PARAMS] };
  if (hideUntilTarget || hideUntilLead) return { ...screen, extra_params: ['--window-position=-20000,-20000', '--start-minimized', ...SAVING_PARAMS] };
  return { ...screen, extra_params: [...SAVING_PARAMS] };
}
