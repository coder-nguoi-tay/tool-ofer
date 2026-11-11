/**
 * Chuẩn hóa id bắt đầu bằng số thành selector thuộc tính, giữ nguyên chuỗi/escape CSS đã hợp lệ.
 * @param {string} selector Selector từ AI hoặc handler trình duyệt.
 * @return {string} Selector tương đương, có thể truy vấn id dạng 3949 mà không báo sai là mất phần tử.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function normalizeElementSelector(selector) {
  let result = '', quote = null, brackets = 0;
  for (let index = 0; index < selector.length; index++) {
    const character = selector[index];
    if (character === '\\') { result += selector.slice(index, index + 2); index++; continue; }
    if (quote) { result += character; if (character === quote) quote = null; continue; }
    if (character === '"' || character === "'") { quote = character; result += character; continue; }
    if (character === '[') brackets++;
    if (character === ']') brackets--;
    if (!brackets && character === '#' && /\d/.test(selector[index + 1] || '')) {
      const id = selector.slice(index + 1).match(/^[0-9][a-zA-Z0-9_-]*/)[0];
      result += `[id="${id}"]`; index += id.length;
    } else result += character;
  }
  return result;
}
