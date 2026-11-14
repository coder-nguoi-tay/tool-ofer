import { protectConfirmedLeadSession } from '../leads/actions/protect-confirmed-lead-session.mjs';

/**
 * Dừng toàn bộ thao tác tự động của đúng IP khi người dùng bật chế độ dừng sau lead.
 * @param {object} session Phiên browser và lựa chọn dừng autofill.
 * @return {boolean} True khi đã có lead và phải giữ browser ở trạng thái không thao tác.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export function shouldStopAfterLead(session) {
  return session?.stopAutofillOnLead === true && session.enableLeadCheck !== false && protectConfirmedLeadSession(session);
}
