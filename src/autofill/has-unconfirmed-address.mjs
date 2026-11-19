import { collectFieldMetadata } from './collect-field-metadata.mjs';
import { locateFormElements } from './form-scope/locate-form-elements.mjs';
import { readAddressSelection } from './read-address-selection.mjs';
import { resolveContactField } from './resolve-contact-field.mjs';

/**
 * Kiểm tra lựa chọn địa chỉ ở đúng form ngay trước thao tác gửi, kể cả khi có nhiều gợi ý khớp.
 * @param {object} frame Frame đang hoạt động.
 * @param {object|null} scope Phạm vi form do app xác minh.
 * @param {string} address Địa chỉ của record đang điền.
 * @return {Promise<boolean>} True khi widget chưa xác nhận địa chỉ hoặc control đã đổi.
 * @throws {Error} Frame đã đóng trong lúc kiểm tra.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function hasUnconfirmedAddress(frame, scope, address) {
  if (!scope) return false;
  if (scope.active === false || scope.unavailable) return true;
  const fields = locateFormElements(frame, 'input:not([type]), input[type=text], input[type=search], input[type=tel], textarea', scope);
  const inputs = await fields.filter({ visible: true }).elementHandles();
  try {
    for (const input of inputs) {
      const metadata = await input.evaluate(collectFieldMetadata);
      if (metadata.readOnly || metadata.disabled) continue;
      if ((resolveContactField(metadata) || metadata.dataAttributes['data-autoleadpc-field']) !== 'address') continue;
      if (!metadata.value && !metadata.required) continue;
      const choice = await input.evaluate(readAddressSelection, address || undefined);
      if (choice.requiresSelection && !choice.retained) return true;
    }
    return false;
  } finally {
    await Promise.all(inputs.map(input => input.dispose()));
  }
}
