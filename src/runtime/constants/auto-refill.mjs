const autoRefill = {
  enabled: false,
  settings: null,
  targetCount: 0,
  queued: false,
  isRefilling: false,
  isStopping: false,
  pendingRefillRequest: false,
  refillJob: null,
  message: 'Sẵn sàng. Bấm Start để bắt đầu.',
  sequential: false,
  // Chế độ tuần tự: 1 tab, delay 5s giữa các phiên
  deviceProfiles: ['windows'],
  // Danh sách profile thiết bị đang được dùng
  stopRequested: false, // Cờ yêu cầu dừng hẳn toàn bộ luồng, không mở hay bù thêm slot nào
  noSlotRefill: false // Giữ phiên đang chạy nhưng không mở slot thay thế khi được bật
};
export { autoRefill };
