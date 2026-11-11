import { autofillQueue } from '../../runtime/constants/autofill-queue.mjs';
import { autofillRecordKey } from './autofill-record-key.mjs';

/**
 * Thêm các record mới từ danh sách vào available, bỏ qua record đã có.
 * @param {object[]} records Danh sách record đã parse.
 * @return {number} Số record mới được thêm.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function importAutofillRecords(records) {
  const existingKeys = new Set([...autofillQueue.available.map(autofillRecordKey), ...autofillQueue.used.map(autofillRecordKey)]);
  let added = 0;
  for (const record of records) {
    const key = autofillRecordKey(record);
    if (!existingKeys.has(key)) {
      autofillQueue.available.push(record);
      existingKeys.add(key);
      added++;
    }
  }
  return added;
}
