/**
 * Kiểm tra xem một ô checkbox có phải là ô xác nhận đồng ý điều khoản / consent / disclosure hay không.
 *
 * @param {object} metadata Thông tin phần tử checkbox thu thập từ DOM.
 * @return {boolean} True nếu là checkbox cần tự động tích.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function isConsentCheckbox(metadata) {
  if (!metadata || metadata.type !== 'checkbox') return false;
  const id = String(metadata.id || '').toLowerCase();
  const name = String(metadata.name || '').toLowerCase();
  const classes = String(metadata.classes || '').toLowerCase();
  const names = Array.isArray(metadata.names) ? metadata.names.map(n => String(n).toLowerCase()) : [];
  const textContent = `${names.join(' ')} ${id} ${name} ${classes}`;
  const dataAttributes = metadata.dataAttributes || {};

  // 1. Checkbox có thuộc tính required hoặc aria-required hoặc data-required
  if (metadata.required || metadata.ariaRequired === 'true' || metadata.isRequired || metadata.dataAttributes?.['data-required'] === 'true') {
    return true;
  }

  // 2. Kiểm tra ID hoặc name
  if (/digitalconsent|consent|disclosure|agree|terms|tcpa|optin|opt_in|privacy|policy|acknowledge|tos|rules|accept|confirm|legal|disclaimer|certify|authorize|authorization|sms|communication|comm|marketing|partner|offer|lead|resident|citizen|age|subscriber|subscribe|continue|proceed|must/i.test(`${id} ${name}`)) {
    return true;
  }

  // 3. Kiểm tra data- attributes (ví dụ: data-tf-element-role="consent-opt-in", data-leadid-type="disclosure")
  for (const [key, val] of Object.entries(dataAttributes)) {
    const keyLower = String(key).toLowerCase();
    const valLower = String(val).toLowerCase();
    if (/consent|disclosure|agree|accept|tcpa|terms|privacy|policy|legal|required|optin|continue|must/i.test(`${keyLower} ${valLower}`)) {
      return true;
    }
  }

  // 4. Kiểm tra class hoặc container class (ví dụ: .consent-box, .consent-row, .terms-check)
  if (/consent|disclosure|tcpa|terms|privacy|policy|agree|accept|checkbox-terms|legal|required|mandatory|must/i.test(classes)) {
    return true;
  }

  // 5. Kiểm tra văn bản nhãn / mô tả đi kèm (ví dụ: "You must accept to continue", "By clicking Continue...", v.v.)
  if (/accept|agree|consent|terms|tcpa|privacy|policy|disclosure|must\s*(?:accept|agree|check|confirm|be)|you\s*must|required|mandatory|i\s*represent|18\+|certify|acknowledge|authorize|understand|by\s*checking|by\s*clicking|continue|proceed|resident|citizen|subscriber|opt-?in|electronic\s*signature|e-sign|automated\s*technology|sms|text\s*message|receive\s*offers|điều\s*khoản|chính\s*sách|đồng\s*ý|chấp\s*nhận|xác\s*nhận/i.test(textContent)) {
    return true;
  }
  return false;
}
export { isConsentCheckbox };
