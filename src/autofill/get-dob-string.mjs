import { parseDobComponents } from './parse-dob-components.mjs';

/**
 * Lấy ngày sinh gộp trong hồ sơ hoặc ghép từ ba thành phần đã cung cấp.
 * @param {object} record Bản ghi chứa cột ngày sinh đầy đủ hoặc các cột tách biệt.
 * @return {string} Ngày sinh gốc hoặc chuỗi rỗng khi thiếu thành phần.
 * @throws {never} Hồ sơ trống trả về chuỗi rỗng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function getDobString(record) {
  if (!record) return '';
  const full = record.dob || record.dateofbirth || record.birthdate || record.ngaythangnamsinh || record.birth || record.bday;
  const day = record.birthday || record.dobday || record.ngaysinh;
  const month = record.birthmonth || record.dobmonth;
  const year = record.birthyear || record.dobyear || record.namsinh;
  const legacyDate = [record.namsinh, day, year].find(value => value && /[./-]/.test(value));
  const candidate = full || legacyDate;
  if (candidate) return parseDobComponents(candidate)?.isoDob ? String(candidate) : '';
  if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^\d{4}$/.test(year)) return '';
  return parseDobComponents(`${year}-${month}-${day}`)?.usDob || '';
}
