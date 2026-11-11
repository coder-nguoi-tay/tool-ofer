/**
 * Tạo mã ổn định cho câu hỏi để nhận ra cùng đáp án sau khi trang dựng lại DOM.
 *
 * @param {object} frame Frame Playwright chứa câu hỏi.
 * @param {string} questionTitle Tiêu đề câu hỏi.
 * @param {object[]} items Các lựa chọn hiển thị.
 * @return {string} Mã gồm đường dẫn trang, câu hỏi và các lựa chọn chuẩn hóa.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function buildSurveyAnswerSignature(frame, questionTitle, items) {
  let pagePath = '';
  try {
    const parsedUrl = new URL(frame.url());
    pagePath = `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {}
  const normalizedQuestion = String(questionTitle ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const normalizedOptions = items.map(item => String(item.text ?? '').replace(/\s+/g, ' ').trim().toLowerCase()).sort().join('|');
  return `${pagePath}|${normalizedQuestion}|${normalizedOptions}`;
}
export { buildSurveyAnswerSignature };
