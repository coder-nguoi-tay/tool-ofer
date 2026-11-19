import { readAddressSelection } from '../autofill/read-address-selection.mjs';
import { operateOnForm } from './operate-on-form.mjs';

/**
 * Đối chiếu địa chỉ đã chọn ngay trước khi cho phép ghi record vào form được cấp quyền.
 * @param {object} form Handle của form mà người vận hành đã chọn.
 * @param {object} operation Khóa trường, nguồn dữ liệu, giá trị và các điều kiện xác minh.
 * @return {Promise<object>} Kết quả điền hoặc trạng thái của lựa chọn hiện tại.
 * @throws {Error} Document đã đóng hoặc thay đổi trong lúc kiểm tra.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export async function applyRecordFormField(form, operation) {
  if ((operation.source || operation.field) !== 'address') return form.evaluate(operateOnForm, operation);
  const handle = await form.evaluateHandle(operateOnForm, { ...operation, locateAddress: true });
  try {
    const input = handle.asElement();
    if (!input) return await handle.jsonValue();
    const choice = await input.evaluate(readAddressSelection, operation.value);
    return await form.evaluate(operateOnForm, { ...operation, addressInput: input, choice });
  } finally {
    await handle.dispose();
  }
}
