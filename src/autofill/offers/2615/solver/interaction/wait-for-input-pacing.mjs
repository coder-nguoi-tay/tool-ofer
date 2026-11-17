// Bản giải riêng của offer 2615, chép từ src/autofill/interaction/wait-for-input-pacing.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
/**
 * Giữ nhịp nhìn thấy giữa click, nhập và chuyển ô trên từng trình duyệt.
 * Hỗ trợ tăng thời gian delay suy nghĩ trước khi chọn đáp án / kết quả theo cấu hình.
 * @param {object|null} page Tab có chuột mô phỏng; môi trường không có chuột không cần chờ.
 * @return {Promise<void>} Hoàn tất khoảng nghỉ để hiển thị thao tác trước bước tiếp theo.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export async function waitForInputPacing(page) {
  const session = page?._autofillSession;
  const delaySec = Number(session?.choiceDelay || 0);
  if (delaySec > 0) {
    const jitterMs = Math.round(delaySec * 1000 * (0.8 + Math.random() * 0.4));
    await new Promise(resolve => setTimeout(resolve, jitterMs));
  } else if (page?.mouse) {
    await new Promise(resolve => setTimeout(resolve, 160));
  }
}
