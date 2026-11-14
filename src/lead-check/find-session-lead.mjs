import { normalizeIpAddress } from './normalize-ip-address.mjs';

/**
 * Tìm lead của phiên trong dữ liệu toffers: khớp clickid trước (không phụ thuộc IP proxy), rồi mới dự phòng theo
 * mọi IP phiên đã thấy (proxy xoay có thể đổi IP giữa lúc kiểm tra, lúc click và lúc gửi form).
 * @param {object|string} responseData Dữ liệu get_lead_datas ({results: [...]}) hoặc chuỗi JSON.
 * @param {{clickIds?: Iterable<string>, ips?: Iterable<string>}} targets clickid ứng viên và IP của phiên.
 * @return {{record: object, ip: string|null, by: 'clickid'|'ip'}|null} Bản ghi lead khớp, null khi chưa có.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export function findSessionLead(responseData, { clickIds = [], ips = [] } = {}) {
  let data = responseData;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { return null; }
  }
  const records = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
  const clickIdSet = new Set([...clickIds].map(String));
  const ipSet = new Set([...ips].map(normalizeIpAddress).filter(Boolean));
  const leadOf = (record, by) => ({ record, ip: normalizeIpAddress(record.ip) || null, by });
  const byClickId = clickIdSet.size ? records.find(record => record?.clickid && clickIdSet.has(String(record.clickid))) : null;
  if (byClickId) return leadOf(byClickId, 'clickid');
  const byIp = ipSet.size ? records.find(record => record?.ip && ipSet.has(normalizeIpAddress(record.ip))) : null;
  return byIp ? leadOf(byIp, 'ip') : null;
}
