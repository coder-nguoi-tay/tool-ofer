/**
 * Chuẩn hóa link offer để so trùng, giữ tham số nghiệp vụ, bỏ fragment và query marketing đã biết.
 * @param {string} value URL cần kiểm tra.
 * @param {string|undefined} base URL gốc dùng cho link tương đối.
 * @return {string} URL HTTP(S) chuẩn hóa hoặc chuỗi rỗng khi không phải link trang.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function normalizeOfferUrl(value, base) {
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    for (const name of [...url.searchParams.keys()]) if (/^utm_/i.test(name) || /^(gclid|fbclid|msclkid)$/i.test(name)) url.searchParams.delete(name);
    url.searchParams.sort();
    return url.href;
  } catch { return ''; }
}
