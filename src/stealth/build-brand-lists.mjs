import { brandOrders } from './state/brand-orders.mjs';
import { greaseChars } from './state/grease-chars.mjs';
import { greaseVersions } from './state/grease-versions.mjs';

/**
 * Sinh danh sách brand Client Hints giống thuật toán GREASE của Chrome (seed = bản chính).
 *
 * @param {string} fullVersion Phiên bản đầy đủ, ví dụ 155.0.8037.98.
 * @param {string|null} brand Tên trình duyệt; null với Chromium thuần.
 * @return {{brands: {brand: string, version: string}[], fullVersionList: {brand: string, version: string}[]}}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function buildBrandLists(fullVersion, brand = 'Google Chrome') {
  const major = Number(String(fullVersion).split('.')[0]) || 0;
  const greaseBrand = `Not${greaseChars[major % greaseChars.length]}A${greaseChars[(major + 1) % greaseChars.length]}Brand`;
  const greaseVersion = greaseVersions[major % greaseVersions.length];
  const order = brandOrders[major % brandOrders.length];
  const make = useFull => {
    const version = useFull ? fullVersion : String(major);
    const grease = {
      brand: greaseBrand,
      version: useFull ? `${greaseVersion}.0.0.0` : greaseVersion
    };
    const chromium = {
      brand: 'Chromium',
      version
    };
    if (!brand) return order[0] > order[1] ? [grease, chromium] : [chromium, grease];
    const list = new Array(3);
    list[order[0]] = grease;
    list[order[1]] = chromium;
    list[order[2]] = {
      brand,
      version
    };
    return list;
  };
  return {
    brands: make(false),
    fullVersionList: make(true)
  };
}
export { buildBrandLists };
