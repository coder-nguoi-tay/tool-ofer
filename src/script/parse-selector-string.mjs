/**
 * Phân tích chuỗi selector sang loại tương ứng (css, xpath, auto).
 * Hỗ trợ các tiền tố: id=, class=, name=, css=, xpath=, //, #, .
 * @param {*} raw raw.
 * @return {*} Kết quả xử lý parse selector string.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function parseSelectorString(raw) {
  let s = String(raw || '').trim();
  if (!s) return {
    type: 'css',
    query: 'body'
  };
  if (s.startsWith('id=')) {
    return {
      type: 'css',
      query: `#${s.slice(3).trim()}`
    };
  }
  if (s.startsWith('class=')) {
    const cls = s.slice(6).trim().split(/\s+/).join('.');
    return {
      type: 'css',
      query: `.${cls}`
    };
  }
  if (s.startsWith('name=')) {
    return {
      type: 'css',
      query: `[name="${s.slice(5).trim()}"]`
    };
  }
  if (s.startsWith('css=')) {
    return {
      type: 'css',
      query: s.slice(4).trim()
    };
  }
  if (s.startsWith('xpath=')) {
    return {
      type: 'xpath',
      query: s.slice(6).trim()
    };
  }
  if (s.startsWith('//') || s.startsWith('(') || s.startsWith('./')) {
    return {
      type: 'xpath',
      query: s
    };
  }
  if (s.startsWith('#') || s.startsWith('.') || s.startsWith('[') || s.includes(' > ') || s.includes(' + ')) {
    return {
      type: 'css',
      query: s
    };
  }
  return {
    type: 'auto',
    query: s
  };
}
export { parseSelectorString };
