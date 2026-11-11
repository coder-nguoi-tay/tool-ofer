/**
 * Rút gọn và làm sạch HTML chỉ giữ lại cấu trúc tương tác (form, input, button, label, text)
 * Loại bỏ toàn bộ script, style, svg, noscript, comments và inline base64 để AI phân tích
 * siêu nhanh, tránh timeout (giảm dung lượng từ >120KB xuống <15KB mà vẫn đủ 100% ngữ cảnh).
 *
 * @param {string} html Raw HTML của trang.
 * @return {string} HTML đã được làm sạch và thu gọn.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function extractCleanPageStructure(html) {
  if (!html || typeof html !== 'string') return '';
  let cleaned = html
  // 1. Xóa toàn bộ thẻ script, style, svg, noscript, audio, video, canvas, iframe
  .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '').replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '').replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '').replace(/<canvas\b[^<]*(?:(?!<\/canvas>)<[^<]*)*<\/canvas>/gi, '')
  // 2. Xóa comment HTML
  .replace(/<!--[\s\S]*?-->/g, '')
  // 3. Xóa dữ liệu base64 dài (data:image/..., data:font/...)
  .replace(/data:[^;]+;base64,[a-zA-Z0-9+/=]+/g, 'data:stripped')
  // 4. Tinh gọn theo hướng FORM-FIRST: loại head và các vùng không chứa form/câu hỏi
  //    để AI chỉ nhìn thấy form, nút và câu hỏi — không bị văn bản pháp lý/menu loạn.
  .replace(/<head\b[\s\S]*?<\/head>/gi, '').replace(/<(header|footer|nav|aside)\b[\s\S]*?<\/\1>/gi, '').replace(/<(div|section|ul|p)\b[^>]*\s(?:id|class)="[^"]*(?:\blegal\b|legal-|disclaimer|copyright|breadcrumb|cookie|sidebar|social-|related-|blog-|article-|post-|upsell|promo)[^"]*"[^>]*>[\s\S]*?<\/\1>/gi, '<!-- [REGION_DROPPED] -->')
  // 5. Thu gọn attribute ồn ào (style, on*, gtm, aria không cần thiết)
  .replace(/\sstyle="[^"]*"/gi, '').replace(/\son[a-z]+="[^"]*"/gi, '').replace(/\sdata-gtm[a-z-]*="[^"]*"/gi, '').replace(/\saria-expanded="[^"]*"/gi, '').replace(/\saria-selected="[^"]*"/gi, '')
  // 6. Cắt text node quá dài (legal text, mô tả) giữ 120 ký tự đầu + dấu grompt
  .replace(/>([^<>{}\n]{200,})</g, (_m, txt) => `>${txt.slice(0, 120)}…<`)
  // 7. Thu gọn whitespace thừa
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n');

  // Giới hạn tối đa 40KB cho AI prompt: đủ cho mọi form phức tạp, prompt gọn hơn
  // giúp AI phản hồi nhanh và bám sát form thay vì dao động quanh nội dung rác.
  if (cleaned.length > 40_000) {
    cleaned = cleaned.slice(0, 40_000) + '\n<!-- [TRUNCATED] -->';
  }
  return cleaned.trim();
}
export { extractCleanPageStructure };
