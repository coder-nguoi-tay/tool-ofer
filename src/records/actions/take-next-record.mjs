import { activeBrowsers } from '../../browser/sessions.mjs';
import { applicationState } from '../../runtime/application-state.mjs';
import { autofillQueue } from '../../runtime/constants/autofill-queue.mjs';
import { autofillRecordKey } from './autofill-record-key.mjs';
import { autofillRecordIdentity } from './autofill-record-identity.mjs';
import { markAutofillRecordUsed } from './mark-autofill-record-used.mjs';
import { saveAutofillQueue } from './save-autofill-queue.mjs';
import { withoutSessionEmail } from './without-session-email.mjs';

// Chốt đồng bộ trước mọi await; WeakRef không giữ sống phiên đã đóng hoặc khởi tạo thất bại.
const recordOwners = new Map();

/**
 * Cấp info chưa thuộc phiên đang chạy, kể cả khi pool quay vòng hoặc có bản ghi trùng.
 * @param {object[]} pool Pool record hoặc hàng đợi available.
 * @param {object[]} [fallback=[]] Pool dự phòng khi không có dữ liệu.
 * @param {object|null} [session=null] Phiên sở hữu record đến khi đóng thật.
 * @return {object} Bản sao info riêng; rỗng khi mọi info đều đang được dùng.
 * @throws {never} Lỗi ghi hàng đợi được xử lý bởi storage hiện có.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
export function takeNextRecord(pool, fallback = [], session = null) {
  for (const [identity, reference] of recordOwners) {
    const owner = reference.deref();
    if (!owner || owner.isClosed && !activeBrowsers.has(owner)) recordOwners.delete(identity);
  }
  const list = pool?.length ? pool : fallback;
  if (!list?.length) {
    session?.addBrowserLog?.({ type: 'autofill_records_empty', detail: 'Đã hết info để cấp riêng. Hãy nạp thêm dữ liệu tự điền.' });
    return {};
  }
  const queued = pool === autofillQueue.available && pool.length > 0;
  const start = queued ? 0 : applicationState.recordRotationCounter % list.length;
  for (let offset = 0; offset < list.length; offset++) {
    const index = (start + offset) % list.length;
    const record = list[index];
    const personalIdentity = autofillRecordIdentity(record);
    // Danh sách chỉ có email vẫn phải cấp được từng email khác nhau.
    const identity = personalIdentity === '{}' ? autofillRecordKey(withoutSessionEmail(record)) : personalIdentity;
    if (applicationState.autofillRejectedKeys.has(personalIdentity) || (queued && applicationState.autofillUsedKeys.has(autofillRecordKey(record))) || (session && recordOwners.has(identity))) continue;
    if (session) recordOwners.set(identity, new WeakRef(session));
    applicationState.recordRotationCounter += offset + 1;
    if (queued) {
      pool.splice(index, 1);
      autofillQueue.used.push(record);
      void saveAutofillQueue();
      void markAutofillRecordUsed(record);
    }
    return withoutSessionEmail(record);
  }
  session?.addBrowserLog?.({ type: 'autofill_records_empty', detail: 'Không còn info riêng: dữ liệu hiện có đang thuộc phiên khác. Hãy nạp thêm info.' });
  return {};
}
