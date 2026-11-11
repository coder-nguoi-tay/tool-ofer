import { getFallbackCity } from '../get-fallback-city.mjs';
import { usStateCodes } from '../state/us-state-codes.mjs';
import { usStateMajorCities } from '../state/us-state-major-cities.mjs';

/**
 * Chỉ suy ra city khi có bang hoặc đầu ZIP được quy tắc hiện tại hỗ trợ, không dùng default Wasilla.
 * @param {object} record Record được cung cấp cho phiên.
 * @return {string} City có căn cứ hoặc chuỗi rỗng khi thiếu dữ liệu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function resolveRecordCity(record = {}) {
  const explicit = record.city || record.town || record.cityname || record.shippingcity;
  if (explicit) return String(explicit);
  const state = String(record.state || record.province || record.stateorprovince || '').trim();
  const code = usStateCodes[state.toLowerCase()] || state.toUpperCase();
  if (usStateMajorCities[code]) return getFallbackCity(code);
  const zip = String(record.zipcode || record.zip || record.postalcode || '').replace(/\D/g, '');
  const prefix = Number(zip.slice(0, 2));
  const supported = [[99,99],[32,34],[90,96],[75,79],[10,14],[60,62],[30,31],[98,99]].some(([low, high]) => prefix >= low && prefix <= high);
  return zip.length === 5 && supported ? getFallbackCity('', zip) : '';
}
