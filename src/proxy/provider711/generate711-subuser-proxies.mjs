import { proxy711 } from './state/proxy711.mjs';

/**
 * Tạo danh sách proxy 711 định dạng User & Pass Auth (Sub-user).
 *
 * Chế độ này dùng trực tiếp gateway của 711proxy, KHÔNG cần Whitelist IP,
 * chạy được trên bất kỳ máy Mac/PC nào, đổi WiFi/IP không ảnh hưởng.
 * Mỗi proxy được cấp một session sticky riêng biệt trong thời gian định cấu hình.
 *
 * @param {Object} [opts]
 * @param {string} [opts.subuser] Tên tài khoản con (Sub-user)
 * @param {string} [opts.subpass] Mật khẩu tài khoản con
 * @param {number} [opts.count=50] Số lượng proxy cần tạo
 * @param {string} [opts.region='US'] Mã quốc gia (US, GB, CA...) hoặc GLOBAL
 * @param {number} [opts.sessTime=20] Thời gian giữ nguyên IP mỗi session (phút)
 * @param {boolean} [opts.sessAuto=true] Tự động đổi IP mới khi hết giờ phiên
 * @param {string} [opts.gatewayHost='global.rotgbapi.trustsource.live']
 * @param {number} [opts.gatewayPort=10000]
 * @return {string[]} Danh sách URL proxy HTTP đầy đủ thông tin xác thực
 * @throws {Error} Khi dữ liệu không hợp lệ hoặc thao tác không thể hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function generate711SubuserProxies({
  subuser = proxy711.subuser,
  subpass = proxy711.subpass,
  count = 50,
  region = 'US',
  sessTime = 20,
  sessAuto = true,
  gatewayHost = proxy711.gatewayHost || 'global.rotgbapi.trustsource.live',
  gatewayPort = proxy711.gatewayPort || 10000
} = {}) {
  const su = String(subuser || proxy711.subuser || '').trim();
  const sp = String(subpass || proxy711.subpass || '').trim();
  if (!su || !sp) {
    throw new Error('Chưa nhập Sub-user và Sub-password của 711Proxy. Vui lòng tạo tài khoản con trên dashboard 711proxy rồi điền vào app.');
  }
  const cleanHost = String(gatewayHost).trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const [hostOnly, portOnly] = cleanHost.split(':');
  const finalHost = hostOnly || 'global.rotgbapi.trustsource.live';
  const finalPort = portOnly ? parseInt(portOnly) : gatewayPort || 10000;
  const lines = [];
  const safeCount = Math.min(500, Math.max(1, parseInt(count) || 50));
  const cleanRegion = String(region || '').trim().toUpperCase();
  for (let i = 0; i < safeCount; i++) {
    const sessId = Math.random().toString(36).slice(2, 10);
    const regPart = cleanRegion && cleanRegion !== 'GLOBAL' ? `-region-${cleanRegion}` : '';
    const sessPart = sessTime > 0 ? `-session-${sessId}-sessTime-${sessTime}` : '';
    const autoPart = sessAuto ? '-sessAuto-1' : '';
    const userString = `${su}-zone-custom${regPart}${sessPart}${autoPart}`;
    const proxyUrl = `http://${encodeURIComponent(userString)}:${encodeURIComponent(sp)}@${finalHost}:${finalPort}`;
    lines.push(proxyUrl);
  }
  return lines;
}
export { generate711SubuserProxies };
