/**
 * Ghi cấu trúc ô nhập và nhãn nghiệp vụ chuẩn, che nội dung tự do cả trong HTML và metadata.
 * @param {object} field Locator ô nhập đang chuẩn bị được điền.
 * @param {object|null} page Tab sở hữu ô; mặc định lấy từ locator.
 * @return {Promise<void>} Hoàn tất ghi HTML nhỏ vào bộ log hiện có, không cản trở thao tác nhập.
 * @throws {never} Lỗi DOM hoặc logger được bỏ qua để luồng nhập tiếp tục.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export async function recordInputFillHtml(field, page = null) {
  try {
    const owner = page || field?.page?.();
    const session = owner?._autofillSession;
    if (!session?.addBrowserLog) return;
    const input = await field.evaluate(element => {
      if (!element.matches('input:not([type="hidden"]), textarea')) return null;
      const clone = element.ownerDocument.createElement(element.localName);
      const fieldType = element.localName === 'textarea' ? 'textarea'
        : /^(?:text|email|tel|number|url|search|password|date|month|week|time|datetime-local|checkbox|radio|range|color|file|button|submit|reset|image)$/.test(element.type) ? element.type : 'text';
      if (element.hasAttribute('type')) clone.setAttribute('type', fieldType);
      const knownLabel = /^(?:(?:first|last|full|given|family|middle)[ _-]?name|name|e[ _-]?mail(?:[ _-]?address)?|(?:phone|telephone)(?:[ _-]?number)?|tel|(?:street[ _-]?)?address(?:[ _-]?(?:line[ _-]?)?[12])?|city|state|zip(?:[ _-]?code)?|postal[ _-]?code|country|dob|date[ _-]?of[ _-]?birth|notes?)$/i;
      for (const name of ['id', 'name', 'aria-label', 'placeholder', 'title']) {
        if (!element.hasAttribute(name)) continue;
        const value = element.getAttribute(name).trim();
        clone.setAttribute(name, knownLabel.test(value) ? value : '[redacted]');
      }
      for (const name of ['required', 'disabled', 'readonly', 'multiple']) {
        if (element.hasAttribute(name)) clone.setAttribute(name, '');
      }
      return { fieldId: clone.id, fieldName: clone.getAttribute('name') || '', fieldType, html: clone.outerHTML, frameUrl: location.href };
    }, undefined, { timeout: 500 });
    if (!input?.html) return;
    const [pageUrl, frameUrl] = [owner.url(), input.frameUrl || owner.url()].map(value => {
      const url = new URL(value);
      if (!['http:', 'https:', 'about:'].includes(url.protocol)) return url.protocol;
      url.search = ''; url.hash = ''; url.username = ''; url.password = '';
      return url.href;
    });
    session.addBrowserLog({ type: 'input_fill_html', ...input, pageUrl, frameUrl, detail: `HTML ô nhập trước khi điền: ${input.fieldId || input.fieldName || input.fieldType}` }, owner);
  } catch {}
}
