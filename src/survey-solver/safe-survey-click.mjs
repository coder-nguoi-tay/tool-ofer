import { humanClick } from '../autofill/human-click.mjs';

/**
 * Click lựa chọn bằng primitive chung, chỉ trả dispatched=true khi thao tác quyết định thành công.
 * @param {object} pageOrFrame Page hoặc Frame sở hữu target.
 * @param {object} targetLocator Locator cần thao tác.
 * @return {Promise<boolean>} Đã dispatch click; caller phải xác minh riêng trạng thái lựa chọn.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function safeSurveyClick(pageOrFrame, targetLocator) {
  const page = typeof pageOrFrame?.page === 'function' ? pageOrFrame.page() : pageOrFrame;
  return humanClick(page, targetLocator);
}
