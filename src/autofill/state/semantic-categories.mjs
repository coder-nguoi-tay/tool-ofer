import { calculateAge } from '../calculate-age.mjs';
import { getAddressString } from '../get-address-string.mjs';
import { getDobString } from '../get-dob-string.mjs';
import { getFallbackCity } from '../get-fallback-city.mjs';
import { getNormalizedPhone } from '../get-normalized-phone.mjs';
import { getPhoneAreaCode } from '../get-phone-area-code.mjs';
import { parseDobComponents } from '../parse-dob-components.mjs';

/**
 * Danh sách mẫu nhận diện các trường thông dụng (đa ngôn ngữ Anh - Việt, hỗ trợ cả form gộp và form chia tách).
 */
const semanticCategories = [
// 1. Thẻ ngân hàng & thanh toán (kiểm tra trước DOB và phone để tránh 'card_exp_month' khớp nhầm /month/)
{
  type: 'card_number',
  patterns: [/cardnumber/, /creditcard/, /ccnumber/, /cardno/, /debitcard/],
  resolve: r => r.cardnumber || r.creditcard
}, {
  type: 'card_exp_month',
  patterns: [/cardexpiresmonth/, /card.*exp.*month/, /exp.*month/, /ccexpmonth/, /expiration.*month/, /^cardexpmonth$/],
  resolve: r => r.cardexpiresmonth || r.cardexpmonth
}, {
  type: 'card_exp_year',
  patterns: [/cardexpiresyear/, /card.*exp.*year/, /exp.*year/, /ccexpyear/, /expiration.*year/, /^cardexpyear$/],
  resolve: r => r.cardexpiresyear || r.cardexpyear
}, {
  type: 'card_cvv',
  patterns: [/cardvalidationcode/, /cvv/, /cvc/, /securitycode/, /cid/],
  resolve: r => r.cardvalidationcode || r.cvv
},
// 2. Chia tách Date of Birth (kiểm tra trước DOB gộp)
{
  type: 'dob_month',
  patterns: [/dob.*month/, /month.*dob/, /birth.*month/, /month.*birth/, /^month$/, /^mm$/, /^dobm$/, /^thang(sinh)?$/, /monthofbirth/],
  resolve: (r, metadata = {}) => {
    if (r.birthmonth) {
      const m = String(r.birthmonth);
      return metadata.maxLength === 2 || metadata.kind === 'select' ? m.padStart(2, '0') : m;
    }
    const parsed = parseDobComponents(getDobString(r));
    if (!parsed) return null;
    if (metadata.maxLength === 2 || metadata.kind === 'select') {
      return parsed.monthPad || parsed.month;
    }
    return parsed.monthPad || parsed.month;
  }
}, {
  type: 'dob_day',
  patterns: [/dobday/, /dayofbirth/, /dob.*day/, /^day$/, /^dd$/, /dobd/],
  resolve: (r, metadata = {}) => {
    if (r.birthday && r.birthyear) {
      const d = String(r.birthday);
      return metadata.maxLength === 2 || metadata.kind === 'select' ? d.padStart(2, '0') : d;
    }
    const parsed = parseDobComponents(getDobString(r));
    if (!parsed) return null;
    if (metadata.maxLength === 2 || metadata.kind === 'select') {
      return parsed.dayPad || parsed.day;
    }
    return parsed.dayPad || parsed.day;
  }
}, {
  type: 'dob_year',
  patterns: [/dob.*year/, /year.*dob/, /birth.*year/, /year.*birth/, /^year$/, /^yyyy$/, /^yy$/, /^doby$/, /^nam$/, /^namsinh$/, /birthyear/],
  resolve: (r, metadata = {}) => {
    if (r.birthyear) {
      const y = String(r.birthyear);
      return metadata.maxLength === 2 ? y.slice(-2) : y;
    }
    const parsed = parseDobComponents(getDobString(r));
    if (!parsed) return null;
    if (metadata.maxLength === 2) return parsed.shortYear;
    return parsed.year;
  }
},
// 2. Chia tách Phone (kiểm tra trước Phone gộp)
{
  type: 'phone_area',
  patterns: [/^(areacode|phone1|tel1|phonearea)$/],
  resolve: r => getPhoneAreaCode(r)
}, {
  type: 'phone_prefix',
  patterns: [/^(prefix|phone2|tel2|phoneprefix)$/],
  resolve: r => {
    const phone = getNormalizedPhone(r);
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 6 ? digits.slice(3, 6) : null;
  }
}, {
  type: 'phone_line',
  patterns: [/^(line|linenumber|phone3|tel3|phoneline)$/],
  resolve: r => {
    const phone = getNormalizedPhone(r);
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(6, 10) : null;
  }
},
// 3. Chia tách SSN (kiểm tra trước SSN gộp)
{
  type: 'ssn1',
  patterns: [/^ssn1$/],
  resolve: r => {
    const ssn = (r.ssn || '').replace(/\D/g, '');
    return ssn.length >= 9 ? ssn.slice(0, 3) : null;
  }
}, {
  type: 'ssn2',
  patterns: [/^ssn2$/],
  resolve: r => {
    const ssn = (r.ssn || '').replace(/\D/g, '');
    return ssn.length >= 9 ? ssn.slice(3, 5) : null;
  }
}, {
  type: 'ssn3',
  patterns: [/^ssn3$/, /ssn.*last4/, /last4.*ssn/, /^last4$/, /^ssn4$/, /ssn_last_4/, /last_4/],
  resolve: r => {
    const ssn = (r.ssn || '').replace(/\D/g, '');
    if (ssn.length >= 9) return ssn.slice(5, 9);
    if (r.ssn_last4) return String(r.ssn_last4).slice(-4);
    // Fallback: lấy 4 số cuối của số điện thoại có sẵn trong dữ liệu (không dùng số tự sinh)
    const rawDigits = String(r.phonenumber || r.phone || r.cellphone || r.homephone || r.workphone || '').replace(/\D/g, '');
    if (rawDigits.length < 7) return null;
    const digits = getNormalizedPhone(r).replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(6, 10) : null;
  }
},
// 4. Các trường họ tên
{
  type: 'first_name',
  patterns: [/^(first|fname|given|forename)/, /^ten$/, /firstname/, /^fn$/],
  resolve: r => {
    if (r.firstname || r.fname) return r.firstname || r.fname;
    if (r.fullname) return r.fullname.trim().split(/\s+/)[0];
    const email = r.email || r.emailaddress || '';
    if (email && email.includes('@')) {
      const local = email.split('@')[0];
      const parts = local.split(/[._\d-]+/).filter(Boolean);
      if (parts.length > 0 && parts[0].length >= 2) {
        return parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
      }
    }
    return null;
  }
}, {
  type: 'middle_name',
  patterns: [/^(middle|mname|mid|initial|minitial|middleinitial)/, /^tendem$/],
  resolve: r => {
    if (r.middleinitial || r.middlename || r.mname) return r.middleinitial || r.middlename || r.mname;
    if (r.fullname) {
      const parts = r.fullname.trim().split(/\s+/);
      if (parts.length >= 3) return parts.slice(1, -1).join(' ');
    }
    return null;
  }
}, {
  type: 'last_name',
  patterns: [/^(last|lname|sur|family)/, /^ho$/, /lastname/, /^ln$/],
  resolve: r => {
    if (r.lastname || r.lname) return r.lastname || r.lname;
    if (r.fullname) return r.fullname.trim().split(/\s+/).slice(1).join(' ') || r.fullname;
    const email = r.email || r.emailaddress || '';
    if (email && email.includes('@')) {
      const local = email.split('@')[0];
      const parts = local.split(/[._\d-]+/).filter(Boolean);
      if (parts.length > 1 && parts[1].length >= 2) {
        return parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase();
      }
    }
    return null;
  }
}, {
  type: 'full_name',
  patterns: [/^(full|your)?name$/, /^(hoten|customername)$/],
  resolve: r => r.fullname || (r.firstname && r.lastname ? `${r.firstname} ${r.lastname}` : null)
},
// 5. Date of Birth gộp
{
  type: 'dob',
  patterns: [/^(dob|birthdate|dateofbirth|birthday|bday|namsinh|ngaysinh|ngaythangnamsinh|birth|mmddyyyy|mmddyy|ddmmyyyy|birthdt)$/, /date.*birth/, /birth.*date/],
  resolve: (r, metadata = {}) => {
    const raw = getDobString(r);
    if (!raw) return null;
    const parsed = parseDobComponents(raw);
    if (!parsed) return raw;
    if (metadata.type === 'date') return parsed.isoDob || raw;
    if (metadata.maxLength === 4 || metadata.kind === 'select' && !metadata.names?.some(n => /month|day/i.test(n))) {
      return parsed.year;
    }
    return parsed.usDob || raw;
  }
},
// 6. Số điện thoại gộp
{
  type: 'phone',
  patterns: [/phone/, /^tel(ephone)?$/, /mobile/, /cell/, /^sdt$/, /dienthoai/],
  resolve: r => getNormalizedPhone(r)
},
// 7. Email
{
  type: 'email',
  patterns: [/email/, /^mail$/],
  resolve: (r, metadata = {}) => {
    const assigned = metadata?.assignedEmail || r.assignedEmail;
    if (assigned) return assigned;
    const em = r.email || r.emailaddress || r.mail || r.userid;
    if (em) return em.includes('@') ? em : `${em}@gmail.com`;
    // Không tự sinh email: chỉ dùng email trong danh sách app cung cấp (hết thì để trống).
    return null;
  }
},
// 8. SSN gộp
{
  type: 'ssn',
  patterns: [/ssn/, /socialsecurity/, /^social$/],
  resolve: r => {
    // Chỉ dùng SSN có trong dữ liệu, không tự ghép từ số điện thoại.
    return r.ssn || r.socialsecurity || null;
  }
},
// 9. Địa chỉ (address2 kiểm tra trước address để tránh address khớp nhầm ô address2)
{
  type: 'address2',
  patterns: [/address2/, /^apt/, /^suite/, /^unit/, /addressline2/, /streetline2/, /street2/],
  resolve: r => r.address2 || r.apt || r.suite || ''
}, {
  type: 'address',
  patterns: [/address/, /street/, /^diachi$/, /^addr/, /address1/, /addressline1/, /streetline1/, /streetaddress/, /street1/],
  resolve: r => getAddressString(r)
}, {
  type: 'city',
  patterns: [/city/, /town/, /thanhpho/, /^ct$/],
  resolve: r => r.city || r.town || r.thanhpho || getFallbackCity(r?.state, r?.zipcode)
}, {
  type: 'state',
  patterns: [/state/, /province/, /region/, /bang/, /tinh/, /stateorprovince/],
  resolve: r => r.state || r.province || r.stateorprovince
}, {
  type: 'zip',
  patterns: [/zip/, /postal/, /postcode/],
  resolve: r => r.zipcode || r.zip || r.ziporpostcode || r.ziporpostalcode || r.postalcode || r.postcode || r.postal || r.mabuudien
}, {
  type: 'gender',
  patterns: [/gender/, /^sex$/, /gioitinh/],
  resolve: r => {
    const g = r.gender || r.sex || r.gioitinh || '';
    if (g) {
      if (/^m(ale)?$|^nam$/i.test(g)) return 'Male';
      if (/^f(emale)?$|^nu$/i.test(g)) return 'Female';
      return g;
    }
    return null;
  }
},
// Title (Mr./Ms./Mrs.): ưu tiên data có title/gender; thiếu thì đoán theo cột
// gender của bản ghi — không có gì hết thì xoay theo đầy đủ first name hash
// để các lần chạy không lệ cố định một giá trị.
{
  type: 'person_title',
  patterns: [/^title$/, /^title_?select$/, /^salutation$/, /^prefix$/, /^mr\b|^mrs\b|^ms\b/],
  resolve: r => {
    if (r.title) {
      const t = String(r.title).trim();
      if (/^m(r|rs|s)\.?$/i.test(t) || /^(mr|ms|mrs|male|female|nam|nu)$/i.test(t)) {
        if (/^(mrs|ms|f|female|nu)$/i.test(t)) return 'Female';
        if (/^(mr|m|male|nam)$/i.test(t)) return 'Male';
        return t;
      }
    }
    const g = r.gender || r.sex || r.gioitinh || '';
    if (g) {
      if (/^f(emale)?$|^nu$|^mrs$|^ms$/i.test(g)) return 'Female';
      if (/^m(ale)?$|^nam$|^mr$/i.test(g)) return 'Male';
    }
    const first = String(r.firstname || r.first_name || (r.fullname || '').split(/\s+/)[0] || '');
    const last = String(r.lastname || r.last_name || (r.fullname || '').split(/\s+/).slice(-1)[0] || '');
    if (!first && !last && !r.fullname) return null;
    const hash = (first + last).replace(/[^a-z]/gi, '').length || String(r.fullname || '').length;
    return hash % 2 === 0 ? 'Male' : 'Female';
  }
}, {
  type: 'age',
  patterns: [/^age$/, /^tuoi$/, /your.*age/],
  resolve: r => {
    if (r.age) return String(r.age);
    const ageCalc = calculateAge(r);
    return ageCalc !== null ? String(ageCalc) : null;
  }
},
// 10. Ngân hàng & tài khoản
{
  type: 'routing',
  patterns: [/routing/, /^aba$/, /transit/],
  resolve: r => r.routing || r.routingnumber || r.aba
}, {
  type: 'bank_name',
  patterns: [/bankname/, /namebank/, /^bank$/, /nganhang/, /institution/],
  resolve: r => r.namebank || r.bankname || r.bank || r.nganhang
}, {
  type: 'account_number',
  patterns: [/accountnumber/, /accountno/, /acctnumber/, /acctno/, /^number$/, /^account$/],
  resolve: r => r.number || r.accountnumber || r.accountno || r.account
},
// 11. Thu nhập & Tài chính (Smart Contextual Defaults)
{
  type: 'income',
  patterns: [/income/, /salary/, /earnings/, /household.*income/, /annual.*income/, /wage/, /thunhap/],
  resolve: r => r.income || r.salary || r.household_income || r.annual_income || null
}, {
  type: 'debt',
  patterns: [/debt/, /unsecured_debt/, /credit_card_debt/, /tax_debt/, /sotienno/],
  resolve: r => r.debt || r.debt_amount || null
}, {
  type: 'credit_score',
  patterns: [/credit.*score/, /credit.*rating/, /credit_grade/, /diemtindung/],
  resolve: r => r.credit_score || r.credit || null
}, {
  type: 'loan_amount',
  patterns: [/loan.*amount/, /borrow_amount/, /desired_loan/, /vay/],
  resolve: r => r.loan_amount || null
},
// 12. Nhà ở & Công việc (Housing & Employment)
{
  type: 'homeowner',
  patterns: [/homeowner/, /own.*rent/, /rent.*own/, /housing/, /residence_type/, /nha_o/],
  resolve: r => r.homeowner || r.housing || null
}, {
  type: 'employment_status',
  patterns: [/employment/, /work_status/, /job_status/, /vieclam/, /nghenghiep/],
  resolve: r => r.employment || r.employment_status || null
}, {
  type: 'employer',
  patterns: [/employer/, /company_name/, /congty/, /noi_lam_viec/],
  resolve: r => r.employer || r.company || null
}, {
  type: 'job_title',
  patterns: [/job_title/, /jobtitle/, /occupation/, /chucvu/, /position/],
  resolve: r => r.job_title || r.occupation || null
}, {
  type: 'education',
  patterns: [/education/, /degree/, /school_level/, /trinhdo/, /hocvan/],
  resolve: r => r.education || null
}, {
  type: 'years_at_address',
  patterns: [/years.*address/, /time.*address/, /residence_years/, /sonam_o/],
  resolve: r => r.years_at_address || null
}, {
  type: 'months_at_address',
  patterns: [/months.*address/, /residence_months/, /sothang_o/],
  resolve: r => r.months_at_address || null
}, {
  type: 'monthly_rent',
  patterns: [/monthly.*rent/, /mortgage.*payment/, /rent_payment/, /tiennha/],
  resolve: r => r.rent || r.monthly_rent || null
},
// 13. Phương tiện & Cá nhân (Vehicle & Personal)
{
  type: 'vehicle_year',
  patterns: [/vehicle.*year/, /car.*year/, /auto.*year/, /namsanxuat/],
  resolve: r => r.vehicle_year || r.car_year || null
}, {
  type: 'vehicle_make',
  patterns: [/vehicle.*make/, /car.*make/, /auto.*make/, /hangxe/],
  resolve: r => r.vehicle_make || r.car_make || null
}, {
  type: 'vehicle_model',
  patterns: [/vehicle.*model/, /car.*model/, /auto.*model/, /dongxe/],
  resolve: r => r.vehicle_model || r.car_model || null
}, {
  type: 'marital_status',
  patterns: [/marital/, /honnhan/, /married/, /^status$/],
  resolve: r => r.marital_status || null
}, {
  type: 'military',
  patterns: [/military/, /veteran/, /armed.*forces/, /quandong/],
  resolve: r => r.military || null
}, {
  type: 'weight',
  patterns: [/^weight$/, /weight_lbs/, /body_weight/, /cannang/],
  resolve: r => r.weight || null
}, {
  type: 'height_feet',
  patterns: [/height.*feet/, /^feet$/],
  resolve: r => r.height_feet || null
}, {
  type: 'height_inches',
  patterns: [/height.*inches/, /^inches$/],
  resolve: r => r.height_inches || null
}, {
  type: 'height',
  patterns: [/^height$/, /chieucao/],
  resolve: r => r.height || null
}];
export { semanticCategories };
