export const excludedOfferPaths = [
  ['contact.uplevelrewards.com', ['/policies/page/about_our_program', '/policies/page/rzu_program_requirements_']],
  ['contact.flashrewards.co', ['/policies/page/about_our_program', '/policies/page/rzu_program_requirements_']],
  ['secure.usgoldbureau.com', ['/affiliate/affiliate-ira-default']],
];
const excludedPaths = new Map(excludedOfferPaths.map(([host, paths]) => [host, new Set(paths)]));

/**
 * Nhận đúng trang chính sách/offer người dùng yêu cầu đóng, không phụ thuộc query tracking.
 * @param {string} value URL tab hoặc link offerwall.
 * @return {boolean} True nếu đúng host và path thuộc danh sách loại trừ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function isExcludedOfferPageUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && excludedPaths.get(url.hostname)?.has(url.pathname.replace(/\/+$/, '')) === true;
  } catch { return false; }
}
