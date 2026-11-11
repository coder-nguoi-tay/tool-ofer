import { humanClick } from '../../autofill/human-click.mjs';

/**
 * Rê chuột rồi click control hoặc nhãn hiển thị qua primitive chung của autofill.
 * @param {object} locator Control đã xác minh thuộc phạm vi hiện tại.
 * @param {object} readiness Trạng thái sẵn sàng của control.
 * @param {object|null} page Tab sở hữu control; mặc định lấy từ locator.
 * @return {Promise<boolean>} True khi đã dispatch click qua input của trình duyệt.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function clickReadyControl(locator, readiness, page = null) {
  if (!readiness.ready) return false;
  return humanClick(page, locator);
}
