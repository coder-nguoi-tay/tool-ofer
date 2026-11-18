// Bản giải riêng của offer 2615, chép từ src/autofill/interaction/wait-for-input-pacing.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
/**
 * Giữ nhịp nhìn thấy giữa click, nhập và chuyển ô trên từng trình duyệt (chuẩn 160ms theo AGENTS.md).
 * Không bị ảnh hưởng bởi choiceDelay của câu hỏi trắc nghiệm để nhập form luôn nhanh và mượt.
 * @param {object|null} page Tab có chuột mô phỏng; môi trường không có chuột không cần chờ.
 * @return {Promise<void>} Hoàn tất khoảng nghỉ 160ms để hiển thị thao tác trước bước tiếp theo.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function waitForInputPacing(page) {
  if (page?.mouse) {
    await new Promise(resolve => setTimeout(resolve, 160));
  }
}
