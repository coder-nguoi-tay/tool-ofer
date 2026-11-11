/**
 * Dựng báo cáo kiểm tra proxy: cờ trùng IP exit / trùng dòng và CSV để xem lại.
 *
 * Hàm thuần, không gọi mạng, nên kiểm thử được độc lập. Chỉ chẩn đoán danh sách proxy —
 * không mở trang đích và không đụng tới sổ IP đã dùng.
 *
 * @param {object[]} checked Kết quả đã kiểm tra từng proxy (index, proxy, ip?, country?, city?, org?, error?).
 * @return {{results: string[], csv: string, warnings: string[]}} Dòng hiển thị, CSV và cảnh báo.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function buildProxyCheckReport(checked) {
  const ipCounts = new Map();
  const serverCounts = new Map();
  for (const {
    proxy,
    ip,
    error
  } of checked) {
    serverCounts.set(proxy.server, (serverCounts.get(proxy.server) ?? 0) + 1);
    if (!error && ip) ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1);
  }
  const noteFor = ({
    proxy,
    ip,
    error
  }) => {
    const notes = [];
    if (!error && ip && ipCounts.get(ip) > 1) notes.push('TRÙNG IP');
    if (serverCounts.get(proxy.server) > 1) notes.push('TRÙNG DÒNG');
    return notes;
  };
  const serverWidth = Math.max(0, ...checked.map(({
    proxy
  }) => proxy.server.length));
  const results = checked.map(row => {
    const {
      index,
      proxy,
      ip,
      country,
      city,
      org,
      error
    } = row;
    const label = `${String(index + 1).padStart(3)}. ${proxy.server.padEnd(serverWidth)}`;
    const note = noteFor(row);
    const suffix = note.length ? `  [${note.join(', ')}]` : '';
    const base = error ? `${label}  LỖI  ${error}` : `${label}  SỐNG  ${ip}  ${country ?? '??'}  ${city ?? ''}  ${org ?? ''}`.trimEnd();
    return base + suffix;
  });
  const csvCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [['stt', 'proxy', 'trang_thai', 'ip_exit', 'quoc_gia', 'thanh_pho', 'to_chuc', 'ghi_chu'].map(csvCell).join(','), ...checked.map(row => {
    const {
      index,
      proxy,
      ip,
      country,
      city,
      org,
      error
    } = row;
    return [index + 1, proxy.server, error ? 'LOI' : 'SONG', error ? '' : ip, error ? '' : country, error ? '' : city, error ? '' : org, [...noteFor(row), error || ''].filter(Boolean).join('; ')].map(csvCell).join(',');
  })].join('\n');
  const alive = checked.filter(({
    error
  }) => !error).length;
  const duplicateIps = [...ipCounts.values()].filter(count => count > 1).length;
  const warnings = [`${alive}/${checked.length} proxy kết nối được và trả về IP.`];
  if (duplicateIps) warnings.push(`${duplicateIps} IP exit bị nhiều proxy dùng chung (cột ghi chú [TRÙNG IP]).`);
  return {
    results,
    csv,
    warnings
  };
}
