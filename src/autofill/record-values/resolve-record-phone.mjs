import { getNormalizedPhone } from '../get-normalized-phone.mjs';
import { getPhoneAreaCode } from '../get-phone-area-code.mjs';

const nationalPhoneMasks = new Map([
  [String.raw`\(\d{3}\) \d{3}-\d{4}`, '(###) ###-####'],
  [String.raw`\d{3}-\d{3}-\d{4}`, '###-###-####'],
  [String.raw`\d{3}\.\d{3}\.\d{4}`, '###.###.####'],
  [String.raw`\d{10}`, '##########']
]);

/**
 * Nhận dạng mẫu hiển thị số nội địa mà ô điện thoại yêu cầu.
 * @param {string} pattern Mẫu HTML của ô nhập.
 * @return {string|undefined} Mặt nạ cố định nếu nhận diện được.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function getRecordPhoneMask(pattern = '') {
  if (!pattern) return undefined;
  return nationalPhoneMasks.get(pattern.replace(/^\^|\$$/g, '').replaceAll('[0-9]', String.raw`\d`));
}

/**
 * Lấy nguyên số điện thoại của hồ sơ và định dạng theo ô đầy đủ hoặc ô chia phần.
 * @param {object} record Hồ sơ đã gán cho form.
 * @param {string} contact Loại ô phone, phone1, phone2 hoặc phone3.
 * @param {object} metadata Độ dài và mẫu nhập khai báo trên ô.
 * @return {string|null} Số có nguồn từ hồ sơ và vừa với ô nhập.
 * @throws {never} Bỏ qua số thiếu hoặc không thể biểu diễn bằng mẫu đã xác định.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function resolveRecordPhone(record, contact, metadata) {
  if (contact === 'phone1') {
    const areaCode = getPhoneAreaCode(record);
    return metadata.maxLength > 0 && areaCode.length > metadata.maxLength ? null : areaCode || null;
  }
  const raw = getNormalizedPhone(record);
  const digits = raw.replace(/\D/g, '');
  if (!/^[+\d\s().-]+$/.test(raw) || digits.length < 7) return null;
  const isInternational = raw.startsWith('+') && !digits.startsWith('1');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  let display = raw;
  const mask = getRecordPhoneMask(metadata.pattern);
  if (contact !== 'phone') {
    if (isInternational || national.length !== 10) return null;
    const segments = { phone2: national.slice(3, 6), phone3: national.slice(6) };
    display = segments[contact];
    if (!display) return null;
  } else if (mask) {
    if (isInternational || national.length !== 10) return null;
    let position = 0;
    display = mask.replace(/#/g, () => national[position++]);
  } else if ([String.raw`\d{10,11}`, String.raw`\d{11}`].includes((metadata.pattern || '').replace(/^\^|\$$/g, '').replaceAll('[0-9]', String.raw`\d`))) {
    display = digits;
  } else if (metadata.maxLength > 0 && raw.length > metadata.maxLength) {
    display = digits.length === 11 && metadata.maxLength === 10 ? national : digits;
  }
  return metadata.maxLength > 0 && display.length > metadata.maxLength ? null : display;
}
