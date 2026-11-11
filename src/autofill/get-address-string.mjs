/**
 * Trích xuất chuỗi địa chỉ từ bất kỳ tên cột nào trong record.
 * @param {*} r r.
 * @return {*} Kết quả xử lý get address string.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getAddressString(r) {
  if (!r || typeof r !== 'object') return '';
  return r.address || r.streetaddress || r.street || r.street_address || r.streetaddr || r.diachi || r.addr || r.address1 || r.address_1 || r.addressline1 || r.streetline1 || r.street1 || r.homeaddress || r.fulladdress || '';
}
export { getAddressString };
