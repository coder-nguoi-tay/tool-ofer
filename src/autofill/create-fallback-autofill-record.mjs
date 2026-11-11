import { DEFAULT_PHONE_AREA_CODES } from './state/default-phone-area-codes.mjs';
import { getNormalizedPhone } from './get-normalized-phone.mjs';
import { randomInt } from 'node:crypto';

/**
 * Tạo một bản ghi dữ liệu mẫu đầy đủ để tự động điền form khi hàng đợi rỗng.
 *
 * @return {object} Bản ghi mẫu với tên, email, phone, zip, địa chỉ chuẩn Mỹ.
 * @throws {never} Dữ liệu mẫu được tạo cục bộ bằng các helper hiện có.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function createFallbackAutofillRecord() {
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const firstNames = ['James', 'Robert', 'John', 'Michael', 'David', 'William', 'Richard', 'Joseph', 'Thomas', 'Charles', 'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];
  const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
  const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
  const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${randNum}@gmail.com`;
  const areaCode = DEFAULT_PHONE_AREA_CODES[randomInt(0, DEFAULT_PHONE_AREA_CODES.length)];
  const phone = getNormalizedPhone({
    areacode: areaCode
  });
  return {
    firstname: fn,
    lastname: ln,
    fullname: `${fn} ${ln}`,
    email,
    phone,
    areacode: areaCode,
    address: '4125 N Inspiration Loop',
    addressline1: '4125 N Inspiration Loop',
    streetaddress: '4125 N Inspiration Loop',
    city: 'Wasilla',
    state: 'AK',
    stateorprovince: 'AK',
    zipcode: '99654',
    zip: '99654',
    country: 'United States',
    sex: 'Male',
    age: '32',
    birthmonth: '04',
    birthday: '15',
    birthyear: '1992',
    dob: '04/15/1992',
    dateofbirth: '04/15/1992'
  };
}
export { createFallbackAutofillRecord };
