import { applicationState } from "../../runtime/application-state.mjs";
import { autofillQueue } from "../../runtime/constants/autofill-queue.mjs";
import { autofillRecordIdentity } from "./autofill-record-identity.mjs";
import { autofillRecordKey } from "./autofill-record-key.mjs";
import { markAutofillRecordUsed } from "./mark-autofill-record-used.mjs";
import { rejectAutofillRecord } from "./reject-autofill-record.mjs";
import { rejectEmail } from "../../queues/email.mjs";
import { safeCloneRecord } from "./safe-clone-record.mjs";
import { saveAutofillQueue } from "./save-autofill-queue.mjs";
import { takeNextEmail } from "../../queues/email.mjs";

/**
 * Xử lý khi form từ chối email hoặc thông tin khác: cho vào danh sách bị từ chối và cấp dữ liệu mới.
 *
 * @param {object} session Phiên đang chạy.
 * @param {{kind: 'email'|'record', record: object}} info Loại dữ liệu bị từ chối và record hiện tại.
 * @return {Promise<object|null>} `{ email }` hoặc record mới; null nếu hết dữ liệu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
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
  const nextIndex = autofillQueue.available.findIndex(r => !applicationState.autofillUsedKeys.has(autofillRecordKey(r)) && !applicationState.autofillRejectedKeys.has(autofillRecordIdentity(r)));
  if (nextIndex === -1) return null;
  const [next] = autofillQueue.available.splice(nextIndex, 1);
  autofillQueue.used.push(next);
  void saveAutofillQueue();
  void markAutofillRecordUsed(next);
  // Bản sao: currentRecord sẽ bị gắn email phiên, không được ghi lên object nằm trong danh sách đã dùng.
  session.currentRecord = safeCloneRecord(next);
  return {
    ...next
  };
}
