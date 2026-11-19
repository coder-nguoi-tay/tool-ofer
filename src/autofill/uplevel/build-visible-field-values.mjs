/**
 * Giữ ánh xạ dữ liệu Uplevel hiện có để điền từng ô thay cho cập nhật DOM hàng loạt.
 * @param {object} record Dữ liệu liên hệ đang dùng cho phiên.
 * @return {object[]} Selector, giá trị và độ dài tối thiểu cần giữ của mỗi ô.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function buildUplevelVisibleFieldValues(record) {
  const phoneDigits = String(record.phone || record.phonenumber || record.cellphone || '').replace(/\D/g, '');
  const phone = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : '';
  return [
    { source: 'email', selector: '#em, input[name="email"]', value: record.email, minimum: 1 },
    { source: 'firstname', selector: '#fn, input[name="firstname"]', value: record.firstname || record.fullname?.split(' ')[0] || record.email?.split('@')[0].split(/[._-]/)[0], minimum: 2 },
    { source: 'lastname', selector: '#ln, input[name="lastname"]', value: record.lastname || record.fullname?.split(' ').slice(1).join(' '), minimum: 2 },
    { source: 'address', selector: '#ad, input[name="address1"]', value: record.address, minimum: 3 },
    { source: 'zipcode', selector: '#zp, input[name="zippost"]', value: String(record.zipcode || record.zip || '').replace(/\D/g, '').slice(0, 5), minimum: 5 },
    { source: 'state', selector: '#state, select[name="state"]', value: String(record.state || '').toUpperCase(), minimum: 2, select: true },
    { source: 'city', selector: '#ct, input[name="city"]', value: record.city || record.town, minimum: 2 },
    { source: 'phone', selector: '#tl, input[name="telephone_two"]', value: phone && `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`, minimum: 14 },
  ];
}
