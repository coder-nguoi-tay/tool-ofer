/**
 * Gộp header gốc của request với Client Hints: bỏ header trùng tên (không phân biệt hoa thường,
 * tránh lọt sec-ch-ua-platform: "macOS" của Chromium nhân Mac) rồi trả về dạng list cho Fetch.continueRequest.
 *
 * @param {Record<string, string>|undefined} requestHeaders
 * @param {Record<string, string>} hints
 * @return {{name: string, value: string}[]}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function mergeClientHintHeaders(requestHeaders, hints) {
  const hintKeys = new Set(Object.keys(hints).map(k => k.toLowerCase()));
  const kept = Object.entries(requestHeaders || {}).filter(([k]) => !hintKeys.has(k.toLowerCase()));
  return [...kept, ...Object.entries(hints)].map(([name, value]) => ({
    name,
    value: String(value)
  }));
}
export { mergeClientHintHeaders };
