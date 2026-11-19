/**
 * Hướng dẫn agent chỉ định trường cần điền bằng bộ quy tắc autofill của app.
 * @param {{customInstructions?:string,html:string}} input Hướng dẫn phiên và các trường đang hiển thị.
 * @return {string} Prompt dùng chung cho agent liên tục, AI khi kẹt và sửa validation.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export function buildFirstPrompt({ customInstructions = '', html }) {
  const extra = typeof customInstructions === 'string' && customInstructions.trim() ? '\nHướng dẫn của người dùng: ' + customInstructions.trim() : '';
  return `Chỉ định trường đang trống hoặc sai theo nhãn. App tự lấy giá trị từ record của tab, khớp lựa chọn và kiểm tra kết quả.
Chỉ trả một mảng JSON các thao tác {"action":"fill","selector":"..."} hoặc {"action":"select","selector":"..."} với selector có trong giao diện.
Bỏ qua trường thiếu dữ liệu. Với câu hỏi trắc nghiệm, radio, checkbox và nút, trả quyền cho autofill xử lý theo quy tắc của app.
KHÔNG submit, click, dùng tool khác hoặc trả về giá trị. Nếu hết trường phù hợp, trả [].${extra}

Giao diện hiện tại:
${html}`;
}

/**
 * Prompt các lượt sau: chỉ giao diện mới và kết quả các thao tác thất bại ở lượt trước.
 *
 * @param {{url:string,html:string,feedback?:string[]}} input Dữ liệu lượt kế tiếp.
 * @return {string} Prompt gửi cho agy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export function buildNextPrompt({ url, html, feedback = [] }) {
  const notes = feedback.length ? `Kết quả lượt trước (đừng lặp lại nguyên xi thao tác lỗi):\n- ${feedback.join('\n- ')}\n\n` : '';
  return `Giao diện mới của tab (vẫn theo luật cũ, chỉ trả mảng JSON, [] nếu không còn thao tác hợp lệ).
${notes}URL: ${url}
HTML GIAO DIỆN:
${html}`;
}
