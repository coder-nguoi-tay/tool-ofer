/**
 * Cộng số thao tác không phải điền ô (bấm đáp án, mở offer, bấm submit) vào bộ đếm hành động.
 *
 * Bộ đếm này dùng để phát hiện tiến triển giữa các lượt quét, không hiển thị thành số ô đã điền.
 *
 * @param {object|null} session Phiên browser đang chạy autofill.
 * @param {number} amount Số thao tác đã thực hiện trong lượt này (mặc định 1).
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function addActionCount(session, amount = 1) {
  if (!session || !(amount > 0)) return;
  session.autofillActions = (session.autofillActions ?? 0) + amount;
  session.lastActionTime = Date.now(); // mốc hoạt động duy nhất (AI, survey, submit cũng ghi field này)
}
export { addActionCount };
