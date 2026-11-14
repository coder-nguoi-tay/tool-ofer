/** Các loại profile được GoLogin công bố; iOS/iPad giả lập được giữ riêng cho tương thích. */
export const GOLOGIN_DEVICE_CHOICES = [
  { key: 'windows', label: 'Windows 10', base: 'windows', os: 'win', osSpec: '' },
  { key: 'windows11', label: 'Windows 11', base: 'windows', os: 'win', osSpec: 'win11' },
  { key: 'macos-intel', label: 'Mac Intel', base: 'macos', os: 'mac', osSpec: '' },
  { key: 'macos-arm', label: 'Mac ARM (M2)', base: 'macos', os: 'mac', osSpec: 'M2' },
  { key: 'linux', label: 'Linux', base: 'linux', os: 'lin', osSpec: '' },
  { key: 'android', label: 'Android', base: 'android', os: 'android', osSpec: '' },
  // iPhone/iPad: UA iOS trên Orbita (profile GoLogin os=mac), không phải Safari thật.
  { key: 'ios', label: 'iPhone', base: 'ios', os: 'mac', osSpec: '' },
  { key: 'ipad', label: 'iPad', base: 'ipad', os: 'mac', osSpec: '' }
];

// iPhone/iPad chỉ chạy khi người dùng tick ô tương ứng; mặc định giữ 6 thiết bị như trước.
export const DEFAULT_GOLOGIN_DEVICES = Object.freeze(GOLOGIN_DEVICE_CHOICES.filter(choice => choice.base !== 'ios' && choice.base !== 'ipad').map(choice => choice.key));
