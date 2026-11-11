const autoRefill = {
  enabled: false,
  settings: null,
  targetCount: 0,
  queued: false,
  message: 'Sẵn sàng. Bấm Start để bắt đầu.',
  sequential: false,
  // Chế độ tuần tự: 1 tab, delay 5s giữa các phiên
  deviceProfiles: ['windows'],
  // Danh sách profile thiết bị đang được dùng
  stopRequested: false // Cờ yêu cầu dừng hẳn toàn bộ luồng, không mở hay bù thêm slot nào
};
export { autoRefill };
