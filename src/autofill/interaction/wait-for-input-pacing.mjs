/**
 * Giữ nhịp nhìn thấy giữa click, nhập và chuyển ô trên từng trình duyệt.
 * @param {object|null} page Tab có chuột mô phỏng; môi trường không có chuột không cần chờ.
 * @return {Promise<void>} Hoàn tất khoảng nghỉ 160ms để hiển thị thao tác trước bước tiếp theo.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function waitForInputPacing(page) {
  if (page?.mouse) await new Promise(resolve => setTimeout(resolve, 160));
}
