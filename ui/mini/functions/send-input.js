let lastMiniClick = 0;

/**
 * Gửi thao tác tới nguồn ảnh đang xem và bỏ phản hồi của tab hoặc lượt bấm đã thay đổi.
 * @param {object} body Thao tác tay và mã nguồn ảnh nếu thao tác bắt đầu từ hộp thoại.
 * @return {Promise<object|null>} Phản hồi của tab hiện tại hoặc thông tin lỗi.
 * @throws {never} Lỗi kết nối được trả về cho giao diện xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
async function sendInput(body) {
  const slot = currentSlot;
  const screenSourceId = body.screenSourceId ?? canvas.dataset.screenSourceId;
  if (slot == null || !screenSourceId || screenSourceId !== canvas.dataset.screenSourceId) {
    return { ok: false, error: 'Đợi khung hình hiện tại rồi thao tác lại.' };
  }
  const click = body.type === 'click' ? ++lastMiniClick : null;
  try {
    const response = await fetch(`/screen/input/${slot}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, screenSourceId }),
    });
    const result = await response.json();
    if (slot !== currentSlot || screenSourceId !== canvas.dataset.screenSourceId || (click !== null && click !== lastMiniClick)) return null;
    return result;
  } catch {
    return null;
  }
}
