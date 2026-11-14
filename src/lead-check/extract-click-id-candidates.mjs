// clickid toffers: 18 ký tự chữ/số ngẫu nhiên (vd. "aA9…"), tạo lúc click và đi theo URL chuyển hướng sang offer.
const CLICK_ID_PATTERN = /(?<![A-Za-z0-9])[A-Za-z0-9]{18}(?![A-Za-z0-9])/g;

/**
 * Lấy mọi chuỗi có dạng clickid trong URL điều hướng (kể cả URL lồng đã mã hoá trong tham số).
 * ponytail: lấy thừa ứng viên (mọi chuỗi 18 ký tự); chỉ đúng clickid của lead mới khớp nên không gây nhận nhầm.
 * @param {string} url URL request điều hướng hoặc redirect.
 * @return {string[]} Các mã ứng viên, không trùng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export function extractClickIdCandidates(url) {
  let text = String(url || '');
  try {
    const parsed = new URL(text);
    text = parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return [];
  }
  const found = new Set();
  for (let depth = 0; depth < 3; depth++) {
    for (const match of text.matchAll(CLICK_ID_PATTERN)) found.add(match[0]);
    let decoded;
    try { decoded = decodeURIComponent(text); } catch { break; }
    if (decoded === text) break;
    text = decoded;
  }
  return [...found];
}
