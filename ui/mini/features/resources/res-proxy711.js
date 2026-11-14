/**
 * Ghi trạng thái lên dòng thông báo 711Proxy.
 * @param {string} text Nội dung.
 * @param {string} color Màu chữ.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniResSet711Status(text, color) {
  const el = document.getElementById('res711Status');
  el.style.color = color;
  el.textContent = text;
}

/**
 * Chuyển chế độ xác thực 711Proxy (subuser / api): ẩn hiện phần nhập tương ứng và lưu lên server.
 * @param {string} mode `subuser` hoặc `api`.
 * @param {boolean} [save=true] Có gửi `POST /711proxy/config` hay không (false khi chỉ nạp lại UI).
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniResSwitch711Mode(mode, save = true) {
  const isSub = mode === 'subuser';
  document.getElementById('res711ModeSubuser').checked = isSub;
  document.getElementById('res711ModeApi').checked = !isSub;
  document.getElementById('res711SecSubuser').style.display = isSub ? 'flex' : 'none';
  document.getElementById('res711SecApi').style.display = isSub ? 'none' : 'flex';
  if (save) void miniResApi('/711proxy/config', { authMode: mode });
}

/**
 * Nạp cấu hình 711Proxy (tài khoản, sub-user, gateway, auto-refill) vào form.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniResInit711() {
  const cfg = await miniResApi('/711proxy/config');
  if (!cfg.error) {
    if (cfg.username) document.getElementById('res711User').value = cfg.username;
    if (cfg.passwd) document.getElementById('res711Pass').value = cfg.passwd;
    if (cfg.subuser) document.getElementById('res711SubUser').value = cfg.subuser;
    if (cfg.subpass) document.getElementById('res711SubPass').value = cfg.subpass;
    if (cfg.gatewayHost && cfg.gatewayPort) {
      const gw = `${cfg.gatewayHost}:${cfg.gatewayPort}`;
      const sel = document.getElementById('res711Gateway');
      if (![...sel.options].some((o) => o.value === gw)) {
        const opt = document.createElement('option');
        opt.value = gw;
        opt.textContent = gw;
        sel.appendChild(opt);
      }
      sel.value = gw;
    }
    miniResSwitch711Mode(cfg.authMode === 'api' ? 'api' : 'subuser', false);
  }
  const ar = await miniResApi('/711proxy/autorefill');
  if (!ar.error) {
    document.getElementById('res711AutoRefill').checked = !!ar.enabled;
    if (ar.region) document.getElementById('res711Region').value = ar.region;
    if (ar.count) document.getElementById('res711Count').value = ar.count;
    if (ar.sessTime) document.getElementById('res711SessTime').value = ar.sessTime;
    document.getElementById('res711SessAuto').checked = !!ar.sessAuto;
  }
}

/**
 * Lưu sub-user / sub-password / gateway 711Proxy.
 * @param {boolean} [notify=false] Hiện thông báo kết quả.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniResSave711Subuser(notify = false) {
  const gateway = document.getElementById('res711Gateway').value || 'global.rotgbapi.trustsource.live:10000';
  const [gatewayHost, gatewayPort] = gateway.split(':');
  const res = await miniResApi('/711proxy/config', {
    authMode: 'subuser',
    subuser: document.getElementById('res711SubUser').value.trim(),
    subpass: document.getElementById('res711SubPass').value,
    gatewayHost,
    gatewayPort: parseInt(gatewayPort) || 10000,
  });
  if (!notify) return;
  if (res.ok) showToast('Đã lưu cấu hình Sub-user 711Proxy.');
  else alert('Lỗi: ' + (res.error || 'Không lưu được'));
}

/**
 * Đăng nhập tài khoản chính 711Proxy (chế độ API); server tự whitelist IP máy chạy app.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniResLogin711() {
  const username = document.getElementById('res711User').value.trim();
  const passwd = document.getElementById('res711Pass').value;
  if (!username || !passwd) { alert('Vui lòng nhập username và password.'); return; }
  miniResSet711Status('Đang đăng nhập...', '#38bdf8');
  const res = await miniResApi('/711proxy/login', { username, passwd });
  if (!res.ok) {
    miniResSet711Status('', '#38bdf8');
    alert('Lỗi đăng nhập: ' + (res.error || 'Không xác định'));
    return;
  }
  const wl = res.whitelist;
  if (wl && wl.ok) miniResSet711Status(`✅ Đăng nhập OK, đã whitelist IP ${wl.ip}`, '#22c55e');
  else if (wl && wl.error) miniResSet711Status(`⚠️ Đăng nhập OK, whitelist lỗi: ${wl.error}`, '#ef4444');
  else miniResSet711Status('✅ Đã lưu mật khẩu & đăng nhập thành công', '#22c55e');
  pollResources();
}

/**
 * Thêm IP máy chạy app vào whitelist 711Proxy (server tự xác định IP).
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniResWhitelist711() {
  const btn = document.getElementById('res711BtnWhitelist');
  btn.disabled = true;
  miniResSet711Status('Đang kiểm tra IP & thêm vào whitelist...', '#38bdf8');
  try {
    const res = await miniResApi('/711proxy/update-whitelist', {});
    if (res.ip) document.getElementById('res711MyIp').textContent = res.ip;
    if (res.ok) {
      miniResSet711Status(`✅ Đã thêm IP ${res.ip} vào whitelist lúc ${new Date().toLocaleTimeString('vi-VN')}`, '#22c55e');
      showToast(`Đã whitelist IP ${res.ip}`);
    } else {
      const err = res.error || 'Không thể cập nhật whitelist.';
      miniResSet711Status(`⚠️ ${err}`, '#ef4444');
      alert('Lỗi cập nhật whitelist: ' + err);
    }
  } finally {
    btn.disabled = false;
  }
}

/**
 * IP public của máy Mac chạy app (server tự tra, không qua proxy). Mini mở trên điện thoại nên không tra từ trình duyệt,
 * nếu không sẽ ra IP của điện thoại thay vì IP cần whitelist.
 * @return {Promise<?string>} IP hoặc null nếu không lấy được.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniResCheckMyIp() {
  const data = await miniResApi('/proxy/public-ip');
  const el = document.getElementById('res711MyIp');
  el.textContent = data.ip || 'Không lấy được';
  return data.ip || null;
}

/**
 * Sao chép IP đang hiển thị vào clipboard (fallback: prompt để tự copy).
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniResCopyMyIp() {
  const ip = document.getElementById('res711MyIp').textContent.trim();
  if (!/^[0-9a-f.:]+$/i.test(ip)) { showToast('Chưa có IP để sao chép.'); return; }
  try {
    await navigator.clipboard.writeText(ip);
    showToast(`Đã sao chép IP ${ip}`);
  } catch {
    prompt('Copy IP:', ip);
  }
}

/**
 * Đọc tuỳ chọn tạo proxy 711 (khu vực, số lượng, sticky, đổi IP trước hạn, tự nạp khi hết).
 * @return {{enabled: boolean, region: string, count: number, sessTime: number, sessAuto: boolean}}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniResRead711Options() {
  return {
    enabled: document.getElementById('res711AutoRefill').checked,
    region: document.getElementById('res711Region').value,
    count: parseInt(document.getElementById('res711Count').value) || 50,
    sessTime: parseInt(document.getElementById('res711SessTime').value) || 20,
    sessAuto: document.getElementById('res711SessAuto').checked,
  };
}

/**
 * Lưu cấu hình tự động nạp proxy 711 khi hàng đợi hết.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniResSave711AutoRefill() {
  await miniResApi('/711proxy/autorefill', miniResRead711Options());
}

/**
 * Tạo proxy 711 theo cấu hình form và nạp vào hàng đợi (payload giống desktop proxy711Generate).
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniResGenerate711() {
  const btn = document.getElementById('res711BtnGenerate');
  if (btn.disabled) return;
  const isSubuser = document.getElementById('res711ModeSubuser').checked;
  const subuser = document.getElementById('res711SubUser').value.trim();
  const subpass = document.getElementById('res711SubPass').value;
  if (isSubuser && (!subuser || !subpass)) {
    alert('Vui lòng nhập Sub-user và mật khẩu sub-user 711Proxy.\n(Tạo tại https://dashboard.711proxy.com/sub-user)');
    return;
  }
  const opts = miniResRead711Options();
  await miniResApi('/711proxy/autorefill', opts);
  btn.disabled = true;
  miniResSet711Status(`Đang tạo ${opts.count} proxy (${isSubuser ? 'User & Pass' : 'API'})...`, '#38bdf8');
  try {
    const res = await miniResApi('/711proxy/generate', {
      authMode: isSubuser ? 'subuser' : 'api',
      subuser,
      subpass,
      gateway: document.getElementById('res711Gateway').value,
      region: opts.region,
      count: opts.count,
      sessTime: opts.sessTime,
      sessAuto: opts.sessAuto,
    });
    if (res.added === undefined) {
      const err = res.error || 'Không xác định';
      miniResSet711Status(`⚠️ Lỗi: ${err}`, '#ef4444');
      alert('Lỗi tạo proxy: ' + err);
      return;
    }
    miniResSet711Status(`✅ Đã tạo ${res.added} proxy lúc ${new Date().toLocaleTimeString('vi-VN')}`, '#22c55e');
    showToast(res.message);
    miniResRefreshProxyHealth();
    pollResources();
  } finally {
    btn.disabled = false;
  }
}

/**
 * Cài dung lượng gói 711Proxy đã mua (GB) để tính phần đã dùng / còn lại.
 * @param {number} gb Số GB của gói.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniResSet711Package(gb) {
  const val = Number(gb);
  if (!val || val <= 0) { alert('Vui lòng nhập số GB hợp lệ (lớn hơn 0).'); return; }
  const res = await miniResApi('/711proxy/package', { packageGb: val });
  if (!res.ok) { alert('Lỗi: ' + (res.error || 'Không lưu được cấu hình gói')); return; }
  showToast(`Đã cài đặt gói 711Proxy: ${val} GB`);
  pollResources();
}
