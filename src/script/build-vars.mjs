/**
 * Build vars.
 * @param {object} record record.
 * @return {*} Kết quả xử lý build vars.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function buildVars(record) {
  const r = record ?? {};
  const phone = String(r.phone ?? r.phonenumber ?? r.phonefull ?? '').replace(/\D/g, '');
  const stateRaw = String(r.state ?? r.statecode ?? '');
  return {
    Fname: r.firstname ?? r.fname ?? r.first_name ?? '',
    Lname: r.lastname ?? r.lname ?? r.last_name ?? '',
    Phone: phone,
    Phone1: phone.slice(0, 3),
    Phone2: phone.slice(3, 6),
    Phone3: phone.slice(6, 10),
    Address: r.address ?? r.streetaddress ?? r.street ?? '',
    City: r.city ?? '',
    State: stateRaw.length === 2 ? stateRaw.toUpperCase() : stateRaw,
    Zipcode: r.zipcode ?? r.zip ?? r.postalcode ?? '',
    AccountEmail: r.email ?? r.emailaddress ?? r.mail ?? '',
    Email: r.email ?? r.emailaddress ?? r.mail ?? '',
    PassEmail: r.passEmail ?? r.emailpassword ?? '',
    RecoverEmail: r.recoverEmail ?? r.recoveryemail ?? '',
    Month: String(r.month ?? r.birthmonth ?? r.dob_month ?? ''),
    Day: String(r.day ?? r.birthday ?? r.dob_day ?? ''),
    Year: String(r.year ?? r.birthyear ?? r.dob_year ?? ''),
    Gender: r.gender ?? '',
    Sex: r.gender ?? r.sex ?? '',
    Home: r.home ?? r.homephone ?? '',
    Username: r.username ?? '',
    Password: r.password ?? ''
  };
}
export { buildVars };
