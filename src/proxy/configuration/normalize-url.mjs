/**
 * Chuẩn hoá URL người dùng nhập, tự thêm https:// khi thiếu scheme.
 *
 * @param {string} input Chuỗi URL thô.
 * @return {string} URL đầy đủ.
 * @throws {Error} Khi URL không hợp lệ hoặc không phải http/https.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function normalizeUrl(input) {
  const value = (input ?? '').trim();
  if (!value) throw new Error('Hãy nhập URL website đích.');
  let targetUrl;
  try {
    targetUrl = new URL(value.includes('://') ? value : `https://${value}`);
  } catch {
    throw new Error('Hãy nhập URL đầy đủ, ví dụ https://example.com.');
  }
  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    throw new Error('URL phải bắt đầu bằng http:// hoặc https://.');
  }
  return targetUrl.href;
}
export { normalizeUrl };
