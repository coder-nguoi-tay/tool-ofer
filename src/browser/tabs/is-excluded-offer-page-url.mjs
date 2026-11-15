import { isBlockedGooglePageUrl } from './is-blocked-google-page-url.mjs';

export const excludedOfferPaths = [
  ['contact.uplevelrewards.com', ['/policies/page/about_our_program', '/policies/page/rzu_program_requirements_']],
  ['contact.flashrewards.co', ['/policies/page/about_our_program', '/policies/page/rzu_program_requirements_']],
  ['secure.usgoldbureau.com', ['/affiliate/affiliate-ira-default']],
  ['yougov.com', ['']],
  ['www.yougov.com', ['']],
  ['super.com', ['/home/landings/earn']],
  ['www.super.com', ['/home/landings/earn']],
  // 2026-11-15: trang chuyển hướng tự mở gần cuối luồng FinancialHelpFinder; người dùng yêu cầu đóng tab ngay.
  ['searchcactus.com', ['/publisher/trackofr.asp']],
  ['www.searchcactus.com', ['/publisher/trackofr.asp']],
  // 2026-11-15: trang chính sách của YouGov mở trong luồng khảo sát; người dùng yêu cầu đóng tab. Chỉ đúng đường dẫn này,
  // các bước join/new/question-* vẫn giữ.
  ['account.yougov.com', ['/us-en/account/privacy-policy']],
];
const excludedPaths = new Map(excludedOfferPaths.map(([host, paths]) => [host, new Set(paths)]));

/**
 * Nhận đúng trang chính sách/offer bị loại trừ hoặc trang Google, không phụ thuộc query tracking.
 * @param {string} value URL tab hoặc link offerwall.
 * @return {boolean} True nếu URL thuộc danh sách chặn tab.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function isExcludedOfferPageUrl(value) {
  if (isBlockedGooglePageUrl(value)) return true;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && excludedPaths.get(url.hostname)?.has(url.pathname.replace(/\/+$/, '')) === true;
  } catch { return false; }
}
