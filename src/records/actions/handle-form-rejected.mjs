import { takeNextRecord } from './take-next-record.mjs';
import { autofillQueue } from "../../runtime/constants/autofill-queue.mjs";
import { rejectAutofillRecord } from "./reject-autofill-record.mjs";
import { rejectEmail } from "../../queues/email.mjs";
import { takeNextEmail } from "../../queues/email.mjs";

/**
 * Xử lý khi form từ chối email hoặc thông tin khác: cho vào danh sách bị từ chối và cấp dữ liệu mới.
 *
 * @param {object} session Phiên đang chạy.
 * @param {{kind: 'email'|'record', record: object}} info Loại dữ liệu bị từ chối và record hiện tại.
 * @return {Promise<object|null>} `{ email }` hoặc record mới; null nếu hết dữ liệu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
export async function handleFormRejected(session, {
  kind,
  record = {}
}) {
  if (kind === 'email') {
    rejectEmail(session.assignedEmail || record.email);
    const next = await takeNextEmail();
    if (!next) return null;
    session.assignedEmail = next;
    return {
      email: next
    };
  }
  await rejectAutofillRecord(record);
  const next = takeNextRecord(autofillQueue.available, [], session);
  if (!Object.keys(next).length) return null;
  session.currentRecord = next;
  if (session.mainPage) session.mainPage._assignedRecord = next;
  return { ...next };
}
