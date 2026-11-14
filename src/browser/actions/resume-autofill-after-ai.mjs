import { shouldStopAfterLead } from '../../autofill/should-stop-after-lead.mjs';

/**
 * Trả quyền xử lý về autofill khi lượt AI kết thúc; watcher quản lý hoàn tất theo mọi tab.
 * @param {object} page Tab vừa được AI hỗ trợ.
 * @param {object} session Phiên trình duyệt cần tiếp tục form và câu hỏi.
 * @return {void} Không tự đóng browser hoặc kết luận hoàn tất từ nội dung trang.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export function resumeAutofillAfterAi(page, session) {
  if (page.isClosed() || session.isClosed || shouldStopAfterLead(session)) return;
  session.triggerAutofillScan?.();
}
