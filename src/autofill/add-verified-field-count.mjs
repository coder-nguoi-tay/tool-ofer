/**
 * Cộng số ô nhập đã điền thực sự (đã đọc lại và xác minh giá trị) vào bộ đếm "trường" của phiên.
 *
 * Chỉ dùng cho input/textarea/select/checkbox đã được xác minh. Các thao tác bấm đáp án,
 * mở offer hay submit phải dùng addActionCount để giao diện không báo sai số ô đã điền.
 *
 * @param {object|null} session Phiên browser đang chạy autofill.
 * @param {number} amount Số ô đã điền và xác minh trong lượt này (mặc định 1).
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function addVerifiedFieldCount(session, amount = 1) {
  if (!session || !(amount > 0)) return;
  session.autofillFields = (session.autofillFields ?? 0) + amount;
  session.lastActionTime = Date.now(); // mốc hoạt động duy nhất (AI, survey, submit cũng ghi field này)
}
export { addVerifiedFieldCount };
