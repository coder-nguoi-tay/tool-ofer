/**
 * Ghi cấu trúc đúng ô sắp nhập vào log phiên, không chụp trang hoặc lưu giá trị cá nhân.
 * @param {object} field Locator ô nhập đang chuẩn bị được điền.
 * @param {object|null} page Tab sở hữu ô; mặc định lấy từ locator.
 * @return {Promise<void>} Hoàn tất ghi HTML nhỏ vào bộ log hiện có, không cản trở thao tác nhập.
 * @throws {never} Lỗi DOM hoặc logger được bỏ qua để luồng nhập tiếp tục.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export async function recordInputFillHtml(field, page = null) {
  try {
    const owner = page || field?.page?.();
    const session = owner?._autofillSession;
    if (!session?.addBrowserLog) return;
    const input = await field.evaluate(element => {
      if (!element.matches('input:not([type="hidden"]), textarea')) return null;
      const clone = element.cloneNode(false);
      const allowedData = new Set(['data-vector-field', 'data-field', 'data-name', 'data-testid', 'data-qa', 'data-tag', 'data-tf-element-role', 'data-leadid-type']);
      for (const attribute of [...clone.attributes]) {
        if (attribute.name === 'value' || attribute.name.startsWith('on') || attribute.name.startsWith('data-') && !allowedData.has(attribute.name)
          || /token|secret|credential|password/i.test(attribute.name)) clone.removeAttribute(attribute.name);
      }
      return { fieldId: (element.id || '').slice(0, 256), fieldName: (element.getAttribute('name') || '').slice(0, 256), fieldType: element.getAttribute('type') || element.tagName.toLowerCase(), html: clone.outerHTML.slice(0, 8192), frameUrl: location.href };
    }, undefined, { timeout: 500 });
    if (!input?.html) return;
    const [pageUrl, frameUrl] = [owner.url(), input.frameUrl || owner.url()].map(value => {
      const url = new URL(value);
      url.search = ''; url.hash = ''; url.username = ''; url.password = '';
      return url.href;
    });
    session.addBrowserLog({ type: 'input_fill_html', ...input, pageUrl, frameUrl, detail: `HTML ô nhập trước khi điền: ${input.fieldId || input.fieldName || input.fieldType}` }, owner);
  } catch {}
}
