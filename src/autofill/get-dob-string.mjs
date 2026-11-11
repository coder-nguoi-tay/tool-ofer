/**
 * Trích xuất chuỗi ngày sinh từ bất kỳ tên cột nào trong record.
 * @param {*} r r.
 * @return {*} Kết quả xử lý get dob string.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getDobString(r) {
  if (!r || typeof r !== 'object') return '';
  if (r.birthyear && r.birthmonth) {
    const mm = String(r.birthmonth).padStart(2, '0');
    const dd = String(r.birthday || '01').padStart(2, '0');
    return `${mm}/${dd}/${r.birthyear}`;
  }
  return r.namsinh || r.ngaysinh || r.ngaythangnamsinh || r.dob || r.birthdate || r.dateofbirth || r.birthday || r.bday || r.birth || '';
}
export { getDobString };
