import { join } from 'node:path';
import { homedir } from 'node:os';
import assert from 'node:assert/strict';
import { parseAutofillRecords, matchFieldValue, isConsentCheckbox, handleRadioAndSurveyOptions } from './autofill.mjs';
import { DEFAULT_LEAD_CONFIG, isLeadPresent, normalizeIpAddress, LeadApiError } from './lead-check.mjs';
import {
  buildProxyCheckReport,
  buildUsedExitIpList,
  chromeExecutableNames,
  isManagedChromeProfilePath,
  createProxyUsageKey,
  hasTrafficBlocked,
  mapWithLimit,
  normalizeUrl,
  parseProxyLine,
  recommendedMaxAlive,
  selectProxies,
  tileAt,
} from './app.mjs';

const parse = (line, type = 'socks5') => parseProxyLine(line, 1, type);
const fails = (line, type = 'socks5') => assert.throws(() => parse(line, type));

// Dòng bỏ qua
assert.equal(parse(''), null);
assert.equal(parse('   '), null);
assert.equal(parse('# ghi chu'), null);

// host:port, kèm khoảng trắng cuối dòng như proxies.txt
assert.deepEqual(parse('184.181.178.33:4145 '), { server: 'socks5://184.181.178.33:4145' });
assert.deepEqual(parse('1.2.3.4:8080', 'http'), { server: 'http://1.2.3.4:8080' });

// host:port|user|pass, và PacketStream (password chứa dấu gạch dưới)
assert.deepEqual(parse('1.2.3.4:1080|bob|secret'), {
  server: 'socks5://1.2.3.4:1080',
  username: 'bob',
  password: 'secret',
});
assert.deepEqual(parse('proxy.packetstream.io:31112|djakita1991|C3Jd7i40B7R7gtC8_country-UnitedStates_session-enT3j9qM'), {
  server: 'socks5://proxy.packetstream.io:31112',
  username: 'djakita1991',
  password: 'C3Jd7i40B7R7gtC8_country-UnitedStates_session-enT3j9qM',
});

// Password có chứa dấu | thì phải giữ nguyên
assert.equal(parse('1.2.3.4:1080|bob|a|b').password, 'a|b');

// proxyHung.txt: host:port|phút|reset-url — trường 2 KHÔNG phải username
assert.deepEqual(parse('171.239.141.122:4005|30|http://171.239.141.122:10000/reset?proxy=171.239.141.122:4005'), {
  server: 'socks5://171.239.141.122:4005',
  rotateMinutes: 30,
  resetUrl: 'http://171.239.141.122:10000/reset?proxy=171.239.141.122:4005',
});

// Dạng URL
assert.deepEqual(parse('socks5://u:p@1.2.3.4:1080'), {
  server: 'socks5://1.2.3.4:1080',
  username: 'u',
  password: 'p',
});
assert.deepEqual(parse('http://1.2.3.4:8080'), { server: 'http://1.2.3.4:8080' });
assert.equal(parse('socks5://u:p%40x@1.2.3.4:1080').password, 'p@x');
fails('socks5://1.2.3.4');          // thiếu cổng
fails('socks4://1.2.3.4:1080');     // scheme không hỗ trợ

// Các format của bản PC không dùng được: phải báo lỗi, không được đoán
fails('14.187.33.24|test|test|VN|XShare.Pro'); // ssh.txt
fails('172.59.105.43');                        // IP.txt, thiếu cổng
fails('TLsIpgICoh1DScBIcQUpTIQIKNGEqMt1pZ');   // tinsoft.txt, API key
fails('1.2.3.4:99999');                        // cổng quá lớn
fails('1.2.3.4:0');                            // cổng 0
fails(':1080');                                // thiếu host

// normalizeUrl
assert.equal(normalizeUrl('example.com'), 'https://example.com/');
assert.equal(normalizeUrl(' https://a.test/x '), 'https://a.test/x');
assert.equal(normalizeUrl('http://a.test/'), 'http://a.test/');
assert.throws(() => normalizeUrl(''));
assert.throws(() => normalizeUrl(undefined));
assert.throws(() => normalizeUrl('http://'));
assert.throws(() => normalizeUrl('file:///etc/passwd'));

// Lưới: không cửa sổ nào tràn khỏi màn hình, và các ô phải khác vị trí nhau
const screen = { width: 1920, height: 1080 };
for (const total of [1, 2, 4, 9, 13, 25]) {
  const seen = new Set();
  for (let index = 0; index < total; index += 1) {
    const { left, top, width, height } = tileAt(index, total, screen);
    assert.ok(left >= 0 && top >= 0, `ô âm toạ độ (total=${total}, i=${index})`);
    assert.ok(left + width <= screen.width, `tràn phải (total=${total}, i=${index})`);
    assert.ok(top + height <= screen.height, `tràn đáy (total=${total}, i=${index})`);
    seen.add(`${left},${top}`);
  }
  assert.equal(seen.size, total, `có ô trùng vị trí (total=${total})`);
}
// Một cửa sổ: bị chặn ở maximumWindow rồi căn giữa màn hình, không phóng kín màn hình
assert.deepEqual(tileAt(0, 1, screen), { width: 900, height: 600, left: 510, top: 240 });

// Cửa sổ luôn nằm trong khoảng minimumWindow..maximumWindow dù ít hay nhiều ô
for (const total of [1, 4, 100]) {
  const { width, height } = tileAt(0, total, screen);
  assert.ok(width >= 280 && width <= 900, `width ngoài khoảng (total=${total}): ${width}`);
  assert.ok(height >= 200 && height <= 600, `height ngoài khoảng (total=${total}): ${height}`);
}

// selectProxies: dòng sai nằm dưới số cửa sổ cần thì không được chặn cả lệnh
const mixedList = '1.2.3.4:1080\n5.6.7.8:1080\nIP-khong-co-cong';
assert.equal(selectProxies(mixedList, 'socks5', 2).length, 2);
assert.throws(() => selectProxies(mixedList, 'socks5', 3));  // phải đọc tới dòng sai
assert.throws(() => selectProxies(mixedList, 'socks5', ''));  // bỏ trống = kiểm cả danh sách
assert.equal(selectProxies('1.2.3.4:1080\n5.6.7.8:1080', 'socks5', '').length, 2);
assert.throws(() => selectProxies('', 'socks5', ''));
assert.throws(() => selectProxies('1.2.3.4:1080', 'socks4', ''));
assert.throws(() => selectProxies('1.2.3.4:1080', 'socks5', 0));
assert.throws(() => selectProxies('1.2.3.4:1080', 'socks5', 2));  // thiếu proxy so với yêu cầu

// Khóa profile: password xoay theo phiên không được đổi khóa, nhưng host/user/thứ tự thì có
const rotatingProxy = { server: 'socks5://1.2.3.4:1080', username: 'u', password: 'session-1' };
const sameProxyNewPassword = { ...rotatingProxy, password: 'session-2' };
assert.equal(createProxyUsageKey(rotatingProxy, 1), createProxyUsageKey(sameProxyNewPassword, 1));
assert.notEqual(createProxyUsageKey(rotatingProxy, 1), createProxyUsageKey(rotatingProxy, 2));
assert.notEqual(
  createProxyUsageKey(rotatingProxy, 1),
  createProxyUsageKey({ ...rotatingProxy, username: 'v' }, 1),
);
assert.notEqual(
  createProxyUsageKey(rotatingProxy, 1),
  createProxyUsageKey({ ...rotatingProxy, server: 'socks5://1.2.3.4:1081' }, 1),
);

// mapWithLimit: giữ thứ tự đầu vào và không vượt mức đồng thời
let running = 0;
let peakRunning = 0;
const doubled = await mapWithLimit([1, 2, 3, 4, 5], 2, async (value) => {
  running += 1;
  peakRunning = Math.max(peakRunning, running);
  await new Promise((resolve) => { setTimeout(resolve, 5); });
  running -= 1;
  return value * 2;
});
assert.deepEqual(doubled, [2, 4, 6, 8, 10]);
assert.equal(peakRunning, 2);

// recommendedMaxAlive: ước tính theo RAM và số nhân, luôn >= 1
const gb = 1024 ** 3;
assert.equal(recommendedMaxAlive(10, 16 * gb), 5);    // giới hạn RAM
assert.equal(recommendedMaxAlive(4, 16 * gb), 4);     // giới hạn CPU
assert.equal(recommendedMaxAlive(10, 4 * gb), 1);     // máy ít RAM chỉ mở 1 profile
assert.equal(recommendedMaxAlive(10, 1 * gb), 1);     // máy rất ít RAM vẫn tối thiểu 1

// buildProxyCheckReport: cờ trùng IP exit / trùng dòng + CSV thoát dấu nháy kép.
const report = buildProxyCheckReport([
  { index: 0, proxy: { server: 'socks5://1.1.1.1:1080' }, ip: '9.9.9.9', country: 'US', city: 'LA', org: 'A "B"' },
  { index: 1, proxy: { server: 'socks5://2.2.2.2:1080' }, ip: '9.9.9.9', country: 'US' },
  { index: 2, proxy: { server: 'socks5://1.1.1.1:1080' }, ip: '8.8.8.8' },
  { index: 3, proxy: { server: 'socks5://3.3.3.3:1080' }, error: 'Timeout' },
]);
assert.ok(report.results[0].includes('TRÙNG IP'), 'IP 9.9.9.9 xuất hiện 2 lần phải bị cờ');
assert.ok(report.results[1].includes('TRÙNG IP'));
assert.ok(report.results[0].includes('TRÙNG DÒNG'), 'server 1.1.1.1 xuất hiện 2 lần phải bị cờ');
assert.ok(report.results[2].includes('TRÙNG DÒNG'));
assert.ok(!report.results[2].includes('TRÙNG IP'), '8.8.8.8 chỉ xuất hiện 1 lần, không cờ');
assert.ok(report.results[3].includes('LỖI'));
assert.ok(report.csv.includes('"A ""B"""'), 'CSV phải nhân đôi dấu nháy kép');
assert.equal(report.csv.split('\n').length, 5); // header + 4 dòng
assert.ok(report.warnings.some((warning) => warning.includes('IP exit bị nhiều proxy')));

console.log('selfcheck OK');

// Bảng IP đã dùng: bỏ bản ghi chưa có IP, gộp theo IP, giữ lần mới nhất, mới nhất lên đầu.
const usedIpSample = buildUsedExitIpList({
  proxies: {
    a: { status: 'failed', exitIp: null, proxy: 'socks5://a:1', attemptedAt: '2026-10-14T10:00:00.000Z' },
    b: { status: 'success', exitIp: '1.1.1.1', proxy: 'socks5://b:2', completedAt: '2026-10-14T10:01:00.000Z' },
    c: { status: 'failed', exitIp: '1.1.1.1', proxy: 'socks5://c:3', completedAt: '2026-10-14T10:05:00.000Z' },
    d: { status: 'success', exitIp: '2.2.2.2', proxy: 'socks5://d:4', completedAt: '2026-10-14T10:03:00.000Z' },
  },
});
assert.deepEqual(usedIpSample.map((entry) => entry.exitIp), ['1.1.1.1', '2.2.2.2']);
assert.equal(usedIpSample[0].uses, 2);
assert.equal(usedIpSample[0].proxy, 'socks5://c:3');
assert.equal(usedIpSample[1].uses, 1);
assert.deepEqual(buildUsedExitIpList({}), []);

// hasTrafficBlocked phát hiện Traffic Blocked! qua nội dung hoặc tiêu đề trang
assert.equal(await hasTrafficBlocked(null), false);
assert.equal(await hasTrafficBlocked({ isClosed: () => true }), false);
assert.equal(await hasTrafficBlocked({
  isClosed: () => false,
  evaluate: async () => false,
}), false);
assert.equal(await hasTrafficBlocked({
  isClosed: () => false,
  evaluate: async () => true,
}), true);
assert.equal(await hasTrafficBlocked({
  isClosed: () => false,
  evaluate: async () => { throw new Error('Evaluation error'); },
}), false);

const blockedTexts = [
  'Traffic Blocked!',
  'Traffic Blocked',
  'TRAFFIC BLOCKED',
  'Error 1020: Traffic Blocked by security rules',
  'traffic   blocked',
];
for (const text of blockedTexts) {
  assert.ok(/traffic\s+blocked/i.test(text), `phải nhận diện được "${text}"`);
}
const normalTexts = [
  'Traffic Light System',
  'Block user profile',
  'Normal landing page',
];
for (const text of normalTexts) {
  assert.ok(!/traffic\s+blocked/i.test(text), `không được nhận nhầm "${text}"`);
}

// Test parseAutofillRecords: hỗ trợ đầy đủ các trường SSN, Email, Banking và tự phục hồi JSON cắt cụt
const sampleLeadJson = `[
  {
    "Năm Sinh": "8/18/1967",
    "Full Name": "Juan Pablo Suarez",
    "Address": "2609 NW 162nd st",
    "City": "Edmond",
    "State": "OK",
    "Zipcode": "73132",
    "Phonenumber": "4059335582",
    "Number": "511485418662",
    "Routing": "63107393",
    "Name bank": "Bank of America",
    "SSN": "653-24-6710",
    "Email": "juan@example.com"
  }
]`;
const parsedLeads = parseAutofillRecords(sampleLeadJson);
assert.equal(parsedLeads.length, 1);
assert.equal(parsedLeads[0].fullname, 'Juan Pablo Suarez');
assert.equal(parsedLeads[0].ssn, '653-24-6710');
assert.equal(parsedLeads[0].routing, '63107393');
assert.equal(parsedLeads[0].email, 'juan@example.com');

// Tự phục hồi JSON bị cắt cụt đuôi
const truncatedLeadJson = sampleLeadJson.trim().slice(0, -1) + ',\n  {\n    "Full Name": "Incomplete';
const recoveredLeads = parseAutofillRecords(truncatedLeadJson);
assert.equal(recoveredLeads.length, 1);
assert.equal(recoveredLeads[0].fullname, 'Juan Pablo Suarez');

// Kiểm tra không còn bị giới hạn 200 KB (thử nghiệm với payload > 300 KB)
const largeRecords = Array.from({ length: 1500 }, (_, i) => ({
  'Full Name': `User Number ${i}`,
  Address: `${i} Main Street, Suite ${i}`,
  City: 'Dewey',
  State: 'OK',
  Zipcode: '74029',
  Phonenumber: '918-397-5329',
  'Date of Birth': '8/4/1984',
}));
const largeJson = JSON.stringify(largeRecords);
assert.ok(largeJson.length > 200_000, `Payload phải lớn hơn 200 KB (thực tế: ${largeJson.length} bytes)`);
const parsedLarge = parseAutofillRecords(largeJson);
assert.equal(parsedLarge.length, 1500);

// Test matchFieldValue: đối sánh thông minh tên trường form Anh - Việt
const leadRecord = parsedLeads[0];
assert.equal(matchFieldValue(['first_name', 'fname'], leadRecord), 'Juan');
assert.equal(matchFieldValue(['last_name', 'lname'], leadRecord), 'Pablo Suarez');
assert.equal(matchFieldValue(['full_name', 'name'], leadRecord), 'Juan Pablo Suarez');
assert.equal(matchFieldValue(['street_address', 'address1'], leadRecord), '2609 NW 162nd st');
assert.equal(matchFieldValue(['city'], leadRecord), 'Edmond');
assert.equal(matchFieldValue(['state'], leadRecord), 'OK');
assert.equal(matchFieldValue(['zip', 'postal_code'], leadRecord), '73132');
assert.equal(matchFieldValue(['phone', 'tel'], leadRecord), '4059335582');
assert.equal(matchFieldValue(['areacode', 'phone1'], leadRecord), '405');
assert.equal(matchFieldValue(['prefix', 'phone2'], leadRecord), '933');
assert.equal(matchFieldValue(['linenumber', 'phone3'], leadRecord), '5582');
assert.equal(matchFieldValue(['ssn', 'social_security'], leadRecord), '653-24-6710');
assert.equal(matchFieldValue(['ssn1'], leadRecord), '653');
assert.equal(matchFieldValue(['ssn2'], leadRecord), '24');
assert.equal(matchFieldValue(['ssn3'], leadRecord), '6710');
assert.equal(matchFieldValue(['routing_number', 'aba'], leadRecord), '63107393');
assert.equal(matchFieldValue(['bank_name', 'bank'], leadRecord), 'Bank of America');
assert.equal(matchFieldValue(['account_number', 'account_no'], leadRecord), '511485418662');
assert.equal(matchFieldValue(['dob', 'birth_date'], leadRecord), '08/18/1967');
assert.equal(matchFieldValue(['birthday'], leadRecord), '08/18/1967');
assert.equal(matchFieldValue(['dob'], leadRecord, { type: 'date' }), '1967-08-18');
assert.equal(matchFieldValue(['month', 'dob_month'], leadRecord), '08');
assert.equal(matchFieldValue(['day', 'dob_day'], leadRecord), '18');
assert.equal(matchFieldValue(['year', 'dob_year'], leadRecord), '1967');

// Kiểm tra đối sánh với định dạng người dùng cung cấp: "năm sinh 8/18/1967, Address 2609 NW 162nd st"
const userSample = {
  namsinh: '8/18/1967',
  address: '2609 NW 162nd st',
};
assert.equal(matchFieldValue(['address'], userSample), '2609 NW 162nd st');
assert.equal(matchFieldValue(['street_address'], userSample), '2609 NW 162nd st');
assert.equal(matchFieldValue(['street'], userSample), '2609 NW 162nd st');
assert.equal(matchFieldValue(['address1'], userSample), '2609 NW 162nd st');
assert.equal(matchFieldValue(['diachi'], userSample), '2609 NW 162nd st');
assert.equal(matchFieldValue(['dob'], userSample), '08/18/1967');
assert.equal(matchFieldValue(['birth_date'], userSample), '08/18/1967');
assert.equal(matchFieldValue(['birthday'], userSample), '08/18/1967');
assert.equal(matchFieldValue(['date_of_birth'], userSample), '08/18/1967');
assert.equal(matchFieldValue(['dob'], userSample, { type: 'date' }), '1967-08-18');
assert.equal(matchFieldValue(['month'], userSample), '08');
assert.equal(matchFieldValue(['day'], userSample), '18');
assert.equal(matchFieldValue(['year'], userSample), '1967');
assert.equal(matchFieldValue(['middle_name', 'initial'], leadRecord), 'Pablo');
assert.equal(matchFieldValue(['email', 'email_address'], leadRecord), 'juan@example.com');
assert.equal(matchFieldValue(['email'], { fullname: 'John Doe', phonenumber: '1234567890' }), 'john.doe7890@gmail.com');

// Kiểm tra dữ liệu mẫu người dùng cung cấp kèm dấu phẩy kết thúc:
const jeremySampleJson = `{
    "Full Name": "Jeremy Adam McNeice",
    "Address": "723 e 6th st",
    "City": "Dewey",
    "State": "OK",
    "Zipcode": "74029",
    "Phonenumber": "918-397-5329",
    "Date of Birth": "8/4/1984"
  },`;
const jeremyParsed = parseAutofillRecords(jeremySampleJson);
assert.equal(jeremyParsed.length, 1);
const jeremy = jeremyParsed[0];
assert.equal(jeremy.fullname, 'Jeremy Adam McNeice');
assert.equal(jeremy.address, '723 e 6th st');
assert.equal(jeremy.city, 'Dewey');
assert.equal(jeremy.state, 'OK');
assert.equal(jeremy.zipcode, '74029');
assert.equal(jeremy.phonenumber, '918-397-5329');
assert.equal(jeremy.dateofbirth, '8/4/1984');

assert.equal(matchFieldValue(['full_name', 'name'], jeremy), 'Jeremy Adam McNeice');
assert.equal(matchFieldValue(['first_name'], jeremy), 'Jeremy');
assert.equal(matchFieldValue(['middle_name'], jeremy), 'Adam');
assert.equal(matchFieldValue(['street_address', 'address'], jeremy), '723 e 6th st');
assert.equal(matchFieldValue(['city'], jeremy), 'Dewey');
assert.equal(matchFieldValue(['state'], jeremy), 'OK');
assert.equal(matchFieldValue(['zip', 'zipcode'], jeremy), '74029');
assert.equal(matchFieldValue(['phone', 'tel'], jeremy), '918-397-5329');
assert.equal(matchFieldValue(['areacode'], jeremy), '918');
assert.equal(matchFieldValue(['prefix'], jeremy), '397');
assert.equal(matchFieldValue(['linenumber'], jeremy), '5329');
assert.equal(matchFieldValue(['dob', 'date_of_birth'], jeremy), '08/04/1984');
assert.equal(matchFieldValue(['dob'], jeremy, { type: 'date' }), '1984-08-04');
assert.equal(matchFieldValue(['month', 'dob_month'], jeremy), '08');
assert.equal(matchFieldValue(['day', 'dob_day'], jeremy), '04');
assert.equal(matchFieldValue(['year', 'dob_year'], jeremy), '1984');

// Kiểm tra đối sánh chính xác các trường ID của LocoTomato v3 (locotomato.com):
assert.equal(matchFieldValue(['v3-first_name'], jeremy), 'Jeremy');
assert.equal(matchFieldValue(['v3-last_name'], jeremy), 'Adam McNeice');
assert.equal(matchFieldValue(['v3-address1'], jeremy), '723 e 6th st');
assert.equal(matchFieldValue(['v3-city'], jeremy), 'Dewey');
assert.equal(matchFieldValue(['v3-zip_code'], jeremy), '74029');
assert.equal(matchFieldValue(['v3-state'], jeremy), 'OK');
assert.equal(matchFieldValue(['v3-dob_month'], jeremy), '08');
assert.equal(matchFieldValue(['v3-dob_day'], jeremy), '04');
assert.equal(matchFieldValue(['v3-dob_year'], jeremy), '1984');
assert.equal(matchFieldValue(['v3-gender'], jeremy), 'Male');
assert.equal(typeof handleRadioAndSurveyOptions, 'function');

// Test handleRadioAndSurveyOptions tự động chọn ngẫu nhiên radio button Yes / No
let clickedRadioSelector = null;
const dispatchedRadioEvents = [];
const mockRadios = [
  { id: 'own_home_yes', name: 'own_home', value: 'yes', disabled: false, checked: false },
  { id: 'own_home_no', name: 'own_home', value: 'no', disabled: false, checked: false },
];
const mockRadioFrame = {
  locator: (sel) => ({
    all: async () => [],
    count: async () => (mockRadios.some((r) => sel.includes(r.id)) ? 1 : 0),
    first: () => ({
      count: async () => 1,
      click: async () => { clickedRadioSelector = sel; },
      evaluate: async (fn) => fn({ checked: false, dispatchEvent: () => {} }),
      dispatchEvent: async (evt) => { dispatchedRadioEvents.push(evt); },
    }),
    nth: () => ({}),
    evaluateAll: async (fn) => fn(mockRadios),
  }),
  evaluate: async () => [],
};
const answeredRadioCount = await handleRadioAndSurveyOptions(mockRadioFrame);
assert.equal(answeredRadioCount, 1);
assert.ok(
  clickedRadioSelector === 'input[type="radio"]#own_home_yes' ||
  clickedRadioSelector === 'input[type="radio"]#own_home_no'
);
assert.ok(dispatchedRadioEvents.includes('input') && dispatchedRadioEvents.includes('change'));

// Tên binary: stable và bản lưu theo version phải thử cả bản Chrome for Testing.
assert.deepEqual(chromeExecutableNames('stable'), ['Google Chrome', 'Google Chrome for Testing']);
assert.deepEqual(chromeExecutableNames('145.0.7632.117'), ['Google Chrome', 'Google Chrome for Testing']);
assert.deepEqual(chromeExecutableNames('beta'), ['Google Chrome Beta']);
assert.deepEqual(chromeExecutableNames('canary'), ['Google Chrome Canary']);

// Test isConsentCheckbox nhận diện chính xác ô digitalConsent / consent-box của form
const sampleConsentMeta = {
  id: 'digitalConsent',
  type: 'checkbox',
  classes: 'consent-box consent-justify consent-row',
  dataAttributes: {
    'data-tf-element-role': 'consent-opt-in',
    'data-leadid-type': 'disclosure',
  },
  names: [
    'By clicking Continue, I represent that I am 18+ years of age; I understand that this site is privately owned...',
  ],
};
assert.equal(isConsentCheckbox(sampleConsentMeta), true);
assert.equal(isConsentCheckbox({ type: 'checkbox', id: 'agree_terms' }), true);
assert.equal(isConsentCheckbox({ type: 'checkbox', required: true }), true);
assert.equal(isConsentCheckbox({ type: 'checkbox', id: 'homeowner_pool' }), false);
assert.equal(isConsentCheckbox({ type: 'text', id: 'digitalConsent' }), false);

// Chốt an toàn cho lệnh xoá profile: chỉ đường dẫn trong kho chrome-profiles được chấp nhận.
const profileStore = join(homedir(), 'Library', 'Application Support', 'AutoLeadPC', 'chrome-profiles');
assert.equal(isManagedChromeProfilePath(join(profileStore, 'stable', '155.0.1.1', 'abc:1')), true);
assert.equal(isManagedChromeProfilePath(profileStore), false);
assert.equal(isManagedChromeProfilePath(join(profileStore, '..', 'chrome-builds')), false);
assert.equal(isManagedChromeProfilePath(homedir()), false);
assert.equal(isManagedChromeProfilePath('/'), false);
// Cây cache song song cũng phải được chấp nhận, vì profile và cache phải xoá cùng nhau.
const cacheStore = join(homedir(), 'Library', 'Caches', 'AutoLeadPC', 'chrome-profiles');
assert.equal(isManagedChromeProfilePath(join(cacheStore, 'stable', '155.0.1.1', 'abc:1')), true);
assert.equal(isManagedChromeProfilePath(cacheStore), false);
assert.equal(isManagedChromeProfilePath(join(homedir(), 'Library', 'Caches', 'AutoLeadPC')), false);
assert.equal(isManagedChromeProfilePath(undefined), false);

// Test kiểm tra lead từ API toffers.top (isLeadPresent, normalizeIpAddress, DEFAULT_LEAD_CONFIG)
assert.equal(normalizeIpAddress('99.145.85.141'), '99.145.85.141');
assert.equal(normalizeIpAddress(' 99.145.85.141:8080 '), '99.145.85.141');
assert.equal(normalizeIpAddress('socks5://1.2.3.4:1080'), '1.2.3.4');
assert.equal(normalizeIpAddress('http://5.6.7.8:8080'), '5.6.7.8');
assert.equal(DEFAULT_LEAD_CONFIG.intervalSeconds, 30);
assert.equal(DEFAULT_LEAD_CONFIG.maxAttempts, 2);

const sampleApiResponse = {
  results: [
    {
      id: '29721',
      typeoffer: '1',
      clickid: 'S9Mnj5lf4UbkJ5dFUB',
      offerid: '2134',
      point: '0.5',
      ip: '99.145.85.141',
      geo: 'US',
      nameoff: 'Cash Assistance',
    },
    {
      id: '29720',
      ip: '174.164.217.22',
      nameoff: 'Cash Assistance',
    },
  ],
  check: '29721',
};

// Khớp chính xác IP
assert.equal(isLeadPresent(sampleApiResponse, '99.145.85.141'), true);
assert.equal(isLeadPresent(sampleApiResponse, '174.164.217.22'), true);
assert.equal(isLeadPresent(sampleApiResponse, '99.145.85.141:4000'), true);
assert.equal(isLeadPresent(sampleApiResponse, ['1.1.1.1', '99.145.85.141']), true);
// Không khớp IP khác
assert.equal(isLeadPresent(sampleApiResponse, '1.2.3.4'), false);
assert.equal(isLeadPresent(sampleApiResponse, null), false);
assert.equal(isLeadPresent(null, '99.145.85.141'), false);
// Hỗ trợ dạng JSON string
assert.equal(isLeadPresent(JSON.stringify(sampleApiResponse), '99.145.85.141'), true);
assert.equal(isLeadPresent(JSON.stringify(sampleApiResponse), '1.2.3.4'), false);

const testAuthErr = new LeadApiError('Hết hạn', 'AUTH_EXPIRED', { status: 302 });
assert.equal(testAuthErr.code, 'AUTH_EXPIRED');
assert.equal(testAuthErr.name, 'LeadApiError');
assert.equal(testAuthErr.details.status, 302);
