/**
 * Prompt lượt đầu của hội thoại: luật + record + hướng dẫn thêm + giao diện hiện tại.
 * Các lượt sau chỉ gửi giao diện mới (xem `buildNextPrompt`), nhờ hội thoại agy được giữ nguyên.
 *
 * @param {{url:string,record:object,customInstructions?:string,html:string}} input Dữ liệu lượt đầu.
 * @return {string} Prompt gửi cho agy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export function buildFirstPrompt({ url, record, customInstructions = '', html }) {
  const extra = typeof customInstructions === 'string' && customInstructions.trim() ? `\n\nHƯỚNG DẪN BỔ SUNG CỦA NGƯỜI DÙNG:\n${customInstructions.trim()}` : '';
  return `BỎ QUA SUY NGHĨ (NO REASONING/THINKING). KHÔNG GIẢI THÍCH. ƯU TIÊN TỐC ĐỘ TỐI ĐA.
Bạn là agent điền offer trong MỘT hội thoại liên tục. Mỗi lượt tôi gửi giao diện hiện tại của tab; bạn trả mảng JSON thao tác UI.
KHÔNG dùng bất kỳ tool nào của bạn (shell, file, browser, web). Chỉ trả JSON.
Chỉ dùng selector được cung cấp cho các control hiển thị và chưa bị khóa. Không đề xuất click/gõ trên bước ẩn. Nếu chưa có thao tác hợp lệ, trả [].

Dữ liệu người dùng cung cấp (dùng đúng giá trị này, không tự bịa email/phone/địa chỉ):
${JSON.stringify(record ?? {}, null, 2)}

QUY TẮC:
- Câu hỏi khảo sát / ý kiến / trắc nghiệm: chọn đáp án "Yes" hoặc lựa chọn đầu tiên hợp lệ.
- Trường nhập liệu (tên, họ, email, phone, ngày sinh, địa chỉ, zip): điền theo dữ liệu người dùng ở trên.
- KHÔNG submit/Continue/Next/CTA điều hướng. Chỉ điền field và chọn đáp án; ứng dụng tự kiểm tra và bấm gửi khi bạn trả [].
- Ô nhập và nút thường nằm trong thẻ <div> class "input", "button", "btn-option" (không bắt buộc trong <form>).

ĐẦU RA BẮT BUỘC: DUY NHẤT 1 mảng JSON, bắt đầu bằng [ và kết thúc bằng ]. Không chữ nào khác.
[
  {"action":"fill","selector":"CSS_SELECTOR","value":"GIÁ_TRỊ"},
  {"action":"select","selector":"CSS_SELECTOR","value":"GIÁ_TRỊ"},
  {"action":"check","selector":"CSS_SELECTOR"},
  {"action":"click","selector":"CSS_SELECTOR"}
]${extra}

URL: ${url}
HTML GIAO DIỆN:
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
