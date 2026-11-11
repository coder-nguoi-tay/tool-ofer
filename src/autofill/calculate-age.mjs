import { getDobString } from './get-dob-string.mjs';
import { parseDobComponents } from './parse-dob-components.mjs';

/**
 * Tính số tuổi ước tính dựa vào ngày sinh trong bản ghi người dùng.
 *
 * @param {object} record Bản ghi người dùng.
 * @return {number|null} Số tuổi hoặc null nếu không xác định được năm sinh.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function calculateAge(record) {
  if (!record || typeof record !== 'object') return null;
  const dobStr = getDobString(record);
  const parsed = parseDobComponents(dobStr);
  if (!parsed || !parsed.year) return null;
  const birthYear = parseInt(parsed.year, 10);
  if (Number.isNaN(birthYear) || birthYear < 1900 || birthYear > 2100) return null;
  const currentYear = new Date().getFullYear();
  return currentYear - birthYear;
}
export { calculateAge };
