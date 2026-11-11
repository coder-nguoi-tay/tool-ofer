import { usStateNames } from '../state/us-state-names.mjs';
import { usStateCodes } from '../state/us-state-codes.mjs';

/**
 * Tạo alias có nghĩa theo loại field; không áp dụng alias tháng cho select tuổi hoặc field khác.
 * @param {string} value Giá trị mong muốn từ record.
 * @param {object} metadata Định danh và nhãn của field.
 * @return {string[]} Các giá trị/nhãn tương đương, ưu tiên dữ liệu gốc.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function buildSelectCandidates(value, metadata = {}) {
  const original = String(value ?? '').trim();
  const candidates = [original];
  const identity = [metadata.id, metadata.name, metadata.placeholder, ...(metadata.names || [])].join(' ').toLowerCase();
  const code = usStateCodes[original.toLowerCase()] || original.toUpperCase();
  if (/state|province|\bbang\b/.test(identity) && usStateNames[code]) candidates.push(code, usStateNames[code], `${code} - ${usStateNames[code]}`);
  if (/title|salutation|honorific/.test(identity)) {
    if (/^(m|male|mr\.?)$/i.test(original)) candidates.push('Male','Mr','Mr.');
    if (/^(f|female|ms\.?|mrs\.?)$/i.test(original)) candidates.push('Female','Ms','Ms.','Mrs','Mrs.');
  }
  const number = Number(original);
  if (/month|\bmm\b|thang/.test(identity) && number >= 1 && number <= 12) {
    const name = ['January','February','March','April','May','June','July','August','September','October','November','December'][number - 1];
    const padded = String(number).padStart(2, '0');
    candidates.push(String(number), padded, name, name.slice(0, 3), `${padded} - ${name}`, `${number} - ${name}`, `${padded}/${name}`, `${name} (${padded})`);
  }
  if (/day|\bdd\b|ngay/.test(identity) && number >= 1 && number <= 31) candidates.push(String(number), String(number).padStart(2, '0'));
  if (/year|\byyyy\b|namsinh/.test(identity) && number >= 1900 && number <= 2100) candidates.push(String(number), String(number).slice(-2));
  return [...new Set(candidates.filter(Boolean))];
}
