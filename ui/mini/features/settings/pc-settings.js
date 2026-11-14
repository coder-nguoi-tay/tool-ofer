/** Khóa thiết bị GoLogin mặc định, khớp DEFAULT_GOLOGIN_DEVICES phía máy chủ. */
const MINI_SET_DEFAULT_GOLOGIN_DEVICES = ['windows', 'windows11', 'macos-intel', 'macos-arm', 'linux', 'android'];

/**
 * Đọc thiết bị GoLogin đang tick trong tab Cài đặt.
 * @return {string[]} Khóa thiết bị theo thứ tự hiển thị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniSetGetGoLoginDevices() {
  return Array.from(document.querySelectorAll('#setGologinDevices [data-gologin-device]'))
    .filter(input => input.checked)
    .map(input => input.dataset.gologinDevice);
}

/**
 * Đọc trạng thái một checkbox, thiếu phần tử thì dùng giá trị mặc định.
 * @param {string} id Id checkbox.
 * @param {boolean} fallback Giá trị khi không tìm thấy phần tử.
 * @return {boolean}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniSetChecked(id, fallback) {
  return document.getElementById(id)?.checked ?? fallback;
}

/**
 * Tùy chọn chống fingerprint và thiết bị GoLogin cho nút Bắt đầu của tab Vận hành.
 * gologinDevices luôn là mảng; tab Vận hành chỉ nên gửi khi engine là GoLogin (giống desktop).
 * @return {{antiFpCanvas: boolean, antiFpClientRects: boolean, antiFpWebgl: boolean, antiFpFonts: boolean, antiFpWebrtc: boolean, antiFpApiFakeIP: boolean, gologinDevices: string[]}}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniSetGetLaunchOverrides() {
  return {
    antiFpCanvas: miniSetChecked('setAfCanvas', false),
    antiFpClientRects: miniSetChecked('setAfClientRects', true),
    antiFpWebgl: miniSetChecked('setAfWebgl', true),
    antiFpFonts: miniSetChecked('setAfFonts', true),
    antiFpWebrtc: miniSetChecked('setAfWebrtc', true),
    antiFpApiFakeIP: miniSetChecked('setAfApiFakeIp', true),
    gologinDevices: miniSetGetGoLoginDevices(),
  };
}

/**
 * Hiện trạng thái token GoLogin mà không bao giờ đưa token đã lưu lên giao diện.
 * @param {boolean} configured Máy chủ đã có token hay chưa.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniSetShowGoLoginTokenState(configured) {
  const input = document.getElementById('setGologinToken');
  if (input) input.placeholder = configured ? 'Đã lưu token — nhập để thay đổi' : 'Nhập token GoLogin';
  miniSetStatus('setGologinTokenStatus', configured
    ? 'Đã cấu hình. Để trống để giữ token hiện tại.'
    : 'Chưa có token GoLogin.', configured ? true : undefined);
}

/**
 * Nạp cài đặt PC (/pc/settings/read): thiết bị GoLogin, trạng thái token, chống fingerprint.
 * Không ghi đè checkbox hệ điều hành của tab Vận hành.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniSetLoadPcSettings() {
  const data = await miniSetApi('/pc/settings/read');
  if (!data || data.error) return;
  const selected = new Set(data.gologinDevices || MINI_SET_DEFAULT_GOLOGIN_DEVICES);
  document.querySelectorAll('#setGologinDevices [data-gologin-device]').forEach(input => {
    input.checked = selected.has(input.dataset.gologinDevice);
  });
  miniSetShowGoLoginTokenState(Boolean(data.gologinConfigured));
  const map = { Canvas: 'setAfCanvas', ClientRects: 'setAfClientRects', WebGLImage: 'setAfWebgl', Fonts: 'setAfFonts', WebRTC: 'setAfWebrtc', ApiFakeIP: 'setAfApiFakeIp' };
  for (const [key, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el && data[key] !== undefined) el.checked = Boolean(data[key]);
  }
  if (typeof syncOptionPills === 'function') syncOptionPills();
}

/**
 * Lưu cài đặt PC giống desktop: token chỉ gửi khi người dùng vừa nhập, OS đọc từ tab Vận hành.
 * @return {Promise<boolean>} true khi máy chủ lưu thành công.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniSetSavePcSettings() {
  const tokenInput = document.getElementById('setGologinToken');
  const newToken = tokenInput?.value.trim() || '';
  const payload = {
    gologinDevices: miniSetGetGoLoginDevices(),
    ...(newToken ? { gologinToken: newToken } : {}),
    browserMode: 'Chrome',
    Canvas: miniSetChecked('setAfCanvas', false),
    ClientRects: miniSetChecked('setAfClientRects', true),
    WebGLImage: miniSetChecked('setAfWebgl', true),
    Fonts: miniSetChecked('setAfFonts', true),
    WebRTC: miniSetChecked('setAfWebrtc', true),
    ApiFakeIP: miniSetChecked('setAfApiFakeIp', true),
    Windows: miniSetChecked('chkWindows', true),
    Mac: miniSetChecked('chkMac', false),
    Linux: miniSetChecked('chkLinux', false),
    Android: miniSetChecked('chkAndroid', false),
    iPhone: miniSetChecked('chkIphone', false),
    iPad: miniSetChecked('chkIpad', false),
  };
  const result = await miniSetApi('/pc/settings/save', { method: 'POST', body: JSON.stringify(payload) });
  if (result?.error) {
    miniSetStatus('setPcStatus', 'Lỗi lưu: ' + result.error, false);
    return false;
  }
  if (newToken) {
    tokenInput.value = '';
    miniSetShowGoLoginTokenState(true);
  }
  miniSetStatus('setPcStatus', 'Đã lưu cài đặt.', true);
  showToast('Đã lưu cài đặt');
  return true;
}

/**
 * Nạp hướng dẫn sử dụng (GET /pc/help) một lần khi mở khối Hướng dẫn.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniSetLoadHelp() {
  const el = document.getElementById('setHelpText');
  if (!el || el.dataset.loaded === '1') return;
  const data = await miniSetApi('/pc/help');
  el.textContent = data?.helpText || data?.error || 'Không tải được hướng dẫn.';
  if (data?.helpText) el.dataset.loaded = '1';
}
