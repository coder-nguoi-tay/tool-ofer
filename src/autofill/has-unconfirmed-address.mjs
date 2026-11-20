import { collectFieldMetadata } from './collect-field-metadata.mjs';
import { locateFormElements } from './form-scope/locate-form-elements.mjs';
import { readAddressSelection } from './read-address-selection.mjs';
import { resolveContactField } from './resolve-contact-field.mjs';

/**
 * Kiểm tra lựa chọn địa chỉ ở đúng form ngay trước thao tác gửi, kể cả khi có nhiều gợi ý khớp.
 * @param {object} frame Frame đang hoạt động.
 * @param {object|null} scope Phạm vi form do app xác minh.
 * @param {string} address Địa chỉ của record đang điền.
 * @return {Promise<string>} Lý do chờ của trường đang hiển thị, rỗng khi được gửi.
 * @throws {Error} Frame đã đóng trong lúc kiểm tra.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function getAddressWaitReason(frame, scope, address) {
  if (!scope) return '';
  if (scope.active === false || scope.unavailable) return 'Chờ form hoạt động trở lại.';
  const fields = locateFormElements(frame, 'input:not([type]), input[type=text], input[type=search], input[type=tel], textarea', scope);
  const inputs = await fields.filter({ visible: true }).elementHandles();
  try {
    for (const input of inputs) {
      const metadata = await input.evaluate(collectFieldMetadata);
      if (metadata.readOnly || metadata.disabled) continue;
      if ((resolveContactField(metadata) || metadata.dataAttributes['data-autoleadpc-field']) !== 'address') continue;
      if (!metadata.value && !metadata.required) continue;
      const choice = await input.evaluate(readAddressSelection, address || undefined);
      if (!choice.requiresSelection || choice.retained) continue;
      if (!address && !choice.display) return 'Record chưa có địa chỉ cho trường bắt buộc.';
      if (choice.attempted || choice.pending) return 'Chờ form xác nhận địa chỉ đã chọn.';
      return 'Chờ một gợi ý địa chỉ khớp duy nhất với record.';
    }
    return '';
  } finally {
    await Promise.all(inputs.map(input => input.dispose()));
  }
}

/**
 * Chặn thao tác gửi khi chưa xác minh được widget địa chỉ của form hiện tại.
 * @param {object} frame Frame chứa form.
 * @param {object|null} scope Phạm vi cần kiểm tra.
 * @param {string} address Địa chỉ cần xác minh.
 * @return {Promise<boolean>} True khi cần giữ form.
 * @throws {Error} Khi frame đã đóng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function hasUnconfirmedAddress(frame, scope, address) {
  return Boolean(await getAddressWaitReason(frame, scope, address));
}
