import { usStateCodes } from './state/us-state-codes.mjs';
import { usStateMajorCities } from './state/us-state-major-cities.mjs';

/**
 * Trả về thành phố fallback hợp lệ theo bang (state) hoặc mã bưu điện (zip).
 * Không dùng thành phố mẫu khi thiếu cả bang và ZIP được hỗ trợ.
 *
 * @param {string} [state=''] Tên hoặc mã viết tắt của bang.
 * @param {string} [zip=''] Mã zip bưu điện (nếu có).
 * @return {string} Thành phố theo quy tắc hiện có, hoặc rỗng nếu không có căn cứ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
function getFallbackCity(state = '', zip = '') {
  const cleanState = String(state || '').trim();
  if (cleanState) {
    const upper = cleanState.toUpperCase();
    if (usStateMajorCities[upper]) return usStateMajorCities[upper];
    const lower = cleanState.toLowerCase();
    const code = usStateCodes[lower];
    if (code && usStateMajorCities[code]) return usStateMajorCities[code];
  }

  // Tra cứu sơ bộ theo đầu số zipcode Mỹ nếu state không nhận diện được
  const cleanZip = String(zip || '').replace(/\D/g, '').slice(0, 5);
  if (cleanZip) {
    const p2 = parseInt(cleanZip.slice(0, 2), 10);
    if (p2 === 99) return 'Wasilla';
    if (p2 >= 32 && p2 <= 34) return 'Miami';
    if (p2 >= 90 && p2 <= 96) return 'Los Angeles';
    if (p2 >= 75 && p2 <= 79) return 'Houston';
    if (p2 >= 10 && p2 <= 14) return 'New York';
    if (p2 >= 60 && p2 <= 62) return 'Chicago';
    if (p2 >= 30 && p2 <= 31) return 'Atlanta';
    if (p2 >= 98 && p2 <= 99) return 'Seattle';
  }
  return '';
}
export { getFallbackCity };
