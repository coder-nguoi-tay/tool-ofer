import { applicationState } from '../../runtime/application-state.mjs';
import { autofillQueue } from '../../runtime/constants/autofill-queue.mjs';
import { autofillRecordIdentity } from './autofill-record-identity.mjs';
import { markAutofillRecordUsed } from './mark-autofill-record-used.mjs';
import { saveAutofillQueue } from './save-autofill-queue.mjs';
import { withoutSessionEmail } from './without-session-email.mjs';

/**
 * Lấy record riêng cho một tab: rút khỏi hàng đợi "Dữ liệu tự điền" (chuyển sang đã dùng) để mỗi tab/trình duyệt
 * nhận một record khác nhau. Trước đây tab chính luôn lấy recordPool[0] nên mọi trình duyệt điền cùng một người.
 * Khi pool không phải hàng đợi (dữ liệu dán trực tiếp / tái dùng record đã dùng) thì xoay vòng lần lượt.
 *
 * @param {object[]} pool Pool record của phiên.
 * @param {object[]} [fallback=[]] Danh sách dự phòng khi pool rỗng.
 * @return {object} Bản sao record cho tab (rỗng nếu không còn record).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function takeNextRecord(pool, fallback = []) {
  if (pool === autofillQueue.available) {
    const index = pool.findIndex(r => !applicationState.autofillRejectedKeys.has(autofillRecordIdentity(r)));
    if (index !== -1) {
      const [record] = pool.splice(index, 1);
      autofillQueue.used.push(record);
      void saveAutofillQueue();
      void markAutofillRecordUsed(record);
      return withoutSessionEmail(record);
    }
  }
  const list = pool && pool.length > 0 ? pool : fallback;
  if (!list || list.length === 0) return {};
  const record = list[applicationState.recordRotationCounter % list.length];
  applicationState.recordRotationCounter += 1;
  return withoutSessionEmail(record);
}
