import { isLeadWaitEnabled } from './is-lead-wait-enabled.mjs';

/**
 * Chặn thao tác vì chờ lead chỉ trong phiên bật chức năng này, bỏ qua cờ cũ khi đã tắt.
 * @param {object} session Phiên và trạng thái kiểm tra lead.
 * @param {object} options Cấu hình autofill.
 * @return {boolean} True khi cần tạm dừng autofill.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function shouldPauseForLead(session, options = {}) {
  return isLeadWaitEnabled(session, options) && (
    ['checking', 'failed'].includes(session.leadCheckStatus) ||
    Boolean((session.screen5LeadCheckTriggered || session.leadCheckTriggered) && !session.screen5LeadVerified)
  );
}
