import { join } from 'node:path';
import { homedir } from 'node:os';
import assert from 'node:assert/strict';
import {
  parseAutofillRecords,
  matchFieldValue,
  isEmailFieldName,
  isConsentCheckbox,
  handleRadioAndSurveyOptions,
  findSubmitButton,
  calculateAge,
  matchAgeRange,
  handleOfferwallCards,
  attachAutofill,
  humanType,
} from './autofill.mjs';
import { DEFAULT_LEAD_CONFIG, isLeadPresent, normalizeIpAddress, LeadApiError } from './lead-check.mjs';
import { parseActions, pageHasWork, executeAction } from './ai-assist.mjs';
import {
  buildProxyCheckReport,
  buildUsedExitIpList,
  chromeExecutableNames,
  isManagedChromeProfilePath,
  createProxyUsageKey,
  hasTrafficBlocked,
  watchTrafficBlockedPage,
  getDeadOrBlockedReason,
  mapWithLimit,
  normalizeUrl,
  parseProxyLine,
  recommendedMaxAlive,
  selectProxies,
  tileAt,
  countSavedHtmlFiles,
  clearAllLogsAndHtml,
  interactionHtmlDirectory,
  interactionLogFilePath,
  emailQueue,
  loadEmailQueue,
  saveEmailQueue,
  parseEmailLine,
  importEmailLines,
  dequeueNextEmail,
  DEVICE_PROFILES,
  autoRefill,
  getNextDeviceProfile,
  resetDeviceProfileRotation,
  deviceProfilesPath,
  loadSavedDeviceProfiles,
  saveSavedDeviceProfiles,
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

// Test phát hiện lỗi mạng / mất kết nối / ERR_CONNECTION_CLOSED / chrome-error://
const connectionErrorSample = `
This site can’t be reached
ipinfo.io unexpectedly closed the connection.
Try:

Checking the connection
Checking the proxy and the firewall
ERR_CONNECTION_CLOSED
`;
assert.equal(
  await hasTrafficBlocked({
    isClosed: () => false,
    url: () => 'https://ipinfo.io',
    evaluate: async () => 'ERR_CONNECTION_CLOSED',
  }),
  true,
);
assert.equal(
  await getDeadOrBlockedReason({
    isClosed: () => false,
    url: () => 'chrome-error://chromewebdata/',
    evaluate: async () => null,
  }),
  'Lỗi mạng trình duyệt (chrome-error)',
);
assert.equal(
  await hasTrafficBlocked({
    isClosed: () => false,
    url: () => 'chrome-error://chromewebdata/',
    evaluate: async () => null,
  }),
  true,
);
assert.equal(
  await getDeadOrBlockedReason({
    isClosed: () => false,
    url: () => 'https://ipinfo.io',
    evaluate: () => {
      const fullText = connectionErrorSample;
      const netErrorMatch = fullText.match(/\b(ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_PROXY_CONNECTION_FAILED|ERR_SOCKS_CONNECTION_FAILED)\b/i);
      if (netErrorMatch) return netErrorMatch[1].toUpperCase();
      return null;
    },
  }),
  'ERR_CONNECTION_CLOSED',
);

// Test getDeadOrBlockedReason nhận diện lỗi sub-frame-error (locotomato.com refused to connect)
assert.equal(
  await getDeadOrBlockedReason({
    isClosed: () => false,
    url: () => 'https://insurancehelpguru.com',
    evaluate: () => 'ERR_CONNECTION_REFUSED: locotomato.com refused to connect.',
  }),
  'ERR_CONNECTION_REFUSED: locotomato.com refused to connect.',
);
assert.equal(
  await getDeadOrBlockedReason({
    isClosed: () => false,
    url: () => 'https://insurancehelpguru.com',
    evaluate: () => null,
    mainFrame: () => ({ url: () => 'https://insurancehelpguru.com' }),
    frames: () => [
      { url: () => 'https://insurancehelpguru.com' },
      {
        url: () => 'chrome-error://chromewebdata/',
        evaluate: async () => 'locotomato.com refused to connect.',
      },
    ],
  }),
  'Lỗi kết nối (locotomato.com refused to connect.)',
);

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

// Kiểm tra đối sánh form Vector landing page (data-vector-field="address1", "city", "state", .input-group, nextElementSibling label):
assert.equal(matchFieldValue(['address1', 'Street Address *', 'input-field'], jeremy), '723 e 6th st');
assert.equal(matchFieldValue(['Street Address *'], jeremy), '723 e 6th st');
assert.equal(matchFieldValue(['Street Address'], jeremy), '723 e 6th st');
assert.equal(matchFieldValue(['city', 'City *', 'input-field'], jeremy), 'Dewey');
assert.equal(matchFieldValue(['state', 'State *', 'Select state…'], jeremy, { kind: 'select' }), 'OK');

// Đảm bảo trường địa chỉ phụ (address2, apt, suite) không bị tranh chấp bởi address chính:
const recordWithApt = { ...jeremy, address2: 'Apt 4B', apt: 'Apt 4B' };
assert.equal(matchFieldValue(['address2'], recordWithApt), 'Apt 4B');
assert.equal(matchFieldValue(['apt'], recordWithApt), 'Apt 4B');
assert.equal(matchFieldValue(['address1'], recordWithApt), '723 e 6th st');
assert.equal(matchFieldValue(['street_address'], recordWithApt), '723 e 6th st');

// Kiểm tra cấu trúc dữ liệu mới: Kendra Wardlaw (State Or Province, Address Line 1, Phone/Cell Phone, Birth Month/Day/Year, Card, Email không có @...)
const kendraSampleJson = `{
  "Title": "Mr",
  "First Name": "Kendra",
  "Middle Initial": "",
  "Last Name": "Wardlaw",
  "Phone": "3077420430",
  "Home Phone": "3077420430",
  "Work Phone": "3077420430",
  "Cell Phone": "3077420430",
  "Fax Phone": "3077420430",
  "Email": "KendraWardlaw5138274",
  "Sex": "Male",
  "Age": "",
  "Birth Month": "04",
  "Birth Day": "7",
  "Birth Year": "1990",
  "Address Line 1": "4125 N Inspiration Loop",
  "City": "Wasilla",
  "State Or Province": "AK",
  "County": "United States",
  "User ID": "KendraWardlaw5138274",
  "Password": "Kendra5138274",
  "Password Question": "What is the first name of your oldest niece?",
  "Password Answer": "Booby Moorer",
  "Card Number": "3077420430",
  "Card Type": "",
  "Card User Name": "Wardlaw",
  "Card Expires Month": "10",
  "Card Expires Year": "2018",
  "Card Validation Code": "000",
  "IPAddress": "",
  "Zipcode": "99654"
}`;
const kendraParsed = parseAutofillRecords(kendraSampleJson);
assert.equal(kendraParsed.length, 1);
const kendra = kendraParsed[0];
assert.equal(kendra.firstname, 'Kendra');
assert.equal(kendra.lastname, 'Wardlaw');
assert.equal(kendra.fullname, 'Kendra Wardlaw');
assert.equal(kendra.phone, '3077420430');
assert.equal(kendra.cellphone, '3077420430');
assert.equal(kendra.email, 'KendraWardlaw5138274@gmail.com');
assert.equal(kendra.state, 'AK');
assert.equal(kendra.stateorprovince, 'AK');
assert.equal(kendra.address, '4125 N Inspiration Loop');
assert.equal(kendra.addressline1, '4125 N Inspiration Loop');
assert.equal(kendra.city, 'Wasilla');
assert.equal(kendra.zipcode, '99654');
assert.equal(kendra.dob, '04/07/1990');
assert.equal(kendra.age, String(new Date().getFullYear() - 1990));

assert.equal(matchFieldValue(['first_name'], kendra), 'Kendra');
assert.equal(matchFieldValue(['last_name'], kendra), 'Wardlaw');
assert.equal(matchFieldValue(['full_name', 'name'], kendra), 'Kendra Wardlaw');
assert.equal(matchFieldValue(['email'], kendra), 'KendraWardlaw5138274@gmail.com');
assert.equal(matchFieldValue(['phone', 'tel'], kendra), '3077420430');
assert.equal(matchFieldValue(['address', 'address1', 'street_address'], kendra), '4125 N Inspiration Loop');
assert.equal(matchFieldValue(['city'], kendra), 'Wasilla');
assert.equal(matchFieldValue(['state'], kendra, { kind: 'select' }), 'AK');
assert.equal(matchFieldValue(['zipcode', 'zip'], kendra), '99654');
assert.equal(matchFieldValue(['gender', 'sex'], kendra), 'Male');
assert.equal(matchFieldValue(['dob_month'], kendra, { maxLength: 2 }), '04');
assert.equal(matchFieldValue(['dob_day'], kendra, { maxLength: 2 }), '07');
assert.equal(matchFieldValue(['dob_year'], kendra), '1990');
assert.equal(matchFieldValue(['card_number'], kendra), '3077420430');
assert.equal(matchFieldValue(['card_exp_month'], kendra), '10');
assert.equal(matchFieldValue(['card_exp_year'], kendra), '2018');
assert.equal(matchFieldValue(['card_cvv'], kendra), '000');
assert.equal(matchAgeRange('35-49', Number(kendra.age)), true);

// Test matchFieldValue với cấu trúc address1 / street-address của form Insurance Help Guru
assert.equal(
  matchFieldValue(['address1', 'street-address', 'Street Address*'], kendra),
  '4125 N Inspiration Loop',
  'matchFieldValue phải khớp chính xác ô address1 và street-address với trường Address Line 1 trong record'
);
assert.equal(
  matchFieldValue(['address1', 'street-address', 'Street Address*'], {}),
  '100 Main St',
  'Khi record thiếu địa chỉ, phải có fallback địa chỉ mặc định hợp lệ để không bị chặn form'
);

// Test humanType mô phỏng gõ phím tuần tự có độ trễ từng ký tự (chống bị phát hiện bot autofill)
const typedChars = [];
const mockTypeField = {
  scrollIntoViewIfNeeded: async () => {},
  click: async () => {},
  focus: async () => {},
  evaluate: async (fn) => fn({ value: '' }),
  pressSequentially: async (char, opts) => {
    typedChars.push({ char, delay: opts?.delay });
  },
  inputValue: async () => typedChars.map((t) => t.char).join(''),
};
await humanType(mockTypeField, 'Hello 123');
assert.equal(typedChars.map((t) => t.char).join(''), 'Hello 123');
assert.equal(typedChars.length, 9);
assert.ok(typedChars.every((t) => typeof t.delay === 'number' && t.delay >= 30), 'Độ trễ mỗi phím phải >= 30ms mô phỏng người thật');

// Test findSubmitButton nhận diện nút data-vector-submit="true" và data-tf-element-role="submit"
const mockVectorSubmitBtn = {
  isVisible: async () => true,
  isEnabled: async () => true,
  innerText: async () => 'CONTINUE',
};
const mockVectorFrame = {
  locator: (sel) => ({
    all: async () => (sel.includes('data-vector-submit') ? [mockVectorSubmitBtn] : []),
  }),
};
const foundVectorSubmit = await findSubmitButton(mockVectorFrame);
assert.equal(foundVectorSubmit, mockVectorSubmitBtn);

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

// Test calculateAge và matchAgeRange
const birth1984Record = { dob: '8/18/1984' };
const calculatedAge = calculateAge(birth1984Record);
const expectedAge = new Date().getFullYear() - 1984;
assert.equal(calculatedAge, expectedAge);
assert.equal(calculateAge({}), null);
assert.equal(calculateAge(null), null);

assert.equal(matchAgeRange('18 - 34', 42), false);
assert.equal(matchAgeRange('35-49', 42), true);
assert.equal(matchAgeRange('50 - 64', 42), false);
assert.equal(matchAgeRange('OVER 65', 42), false);
assert.equal(matchAgeRange('OVER 65', 70), true);
assert.equal(matchAgeRange('65+', 68), true);
assert.equal(matchAgeRange('Under 25', 20), true);
assert.equal(matchAgeRange('Under 25', 30), false);

// Test handleRadioAndSurveyOptions: Vector Survey Income (.btn-option, data-vector-answer="true")
let clickedVectorChoiceId = null;
const mockVectorSurveyFrame = {
  locator: (sel) => ({
    count: async () => 1,
    first: () => ({
      count: async () => 1,
      click: async () => { clickedVectorChoiceId = sel; },
      evaluate: async () => {},
    }),
    evaluateAll: async () => ({}),
  }),
  evaluate: async () => [
    {
      questionTitle: 'What is your approximate annual household income?',
      items: [
        { uid: 'v1', text: 'Under $25,000', value: '1', tagName: 'button' },
        { uid: 'v2', text: '$25,000 - $39,999', value: '2', tagName: 'button' },
        { uid: 'v3', text: '$40,000 - $54,999', value: '3', tagName: 'button' },
      ],
    },
  ],
};
const answeredVectorCount = await handleRadioAndSurveyOptions(mockVectorSurveyFrame);
assert.equal(answeredVectorCount, 1);
assert.ok(
  clickedVectorChoiceId === '[data-autolead-choice-id="v1"]' ||
  clickedVectorChoiceId === '[data-autolead-choice-id="v2"]' ||
  clickedVectorChoiceId === '[data-autolead-choice-id="v3"]'
);

// Test handleRadioAndSurveyOptions: Khớp tuổi thông minh với thẻ <a> (Jeremy sinh năm 1984 -> tuổi 42 -> 35-49)
let clickedAgeChoiceId = null;
const mockAgeFrame = {
  locator: (sel) => ({
    count: async () => 1,
    first: () => ({
      count: async () => 1,
      click: async () => { clickedAgeChoiceId = sel; },
      evaluate: async () => {},
    }),
    evaluateAll: async () => ({}),
  }),
  evaluate: async () => [
    {
      questionTitle: 'What is your age?',
      items: [
        { uid: 'age_1', text: '18 - 34', value: '1', tagName: 'a' },
        { uid: 'age_2', text: '35-49', value: '2', tagName: 'a' },
        { uid: 'age_3', text: '50 - 64', value: '3', tagName: 'a' },
        { uid: 'age_4', text: 'OVER 65', value: '4', tagName: 'a' },
      ],
    },
  ],
};
const answeredAgeCount = await handleRadioAndSurveyOptions(mockAgeFrame, birth1984Record);
assert.equal(answeredAgeCount, 1);
assert.equal(clickedAgeChoiceId, '[data-autolead-choice-id="age_2"]', 'Phải tự động khớp chính xác dải tuổi 35-49 dựa trên ngày sinh 1984');

// Test handleRadioAndSurveyOptions: Creative Homeowner Survey (Rent vs Own)
let clickedHomeChoiceId = null;
const mockHomeFrame = {
  locator: (sel) => ({
    count: async () => 1,
    first: () => ({
      count: async () => 1,
      click: async () => { clickedHomeChoiceId = sel; },
      evaluate: async () => {},
    }),
    evaluateAll: async () => ({}),
  }),
  evaluate: async () => [
    {
      questionTitle: 'Do you own or rent your home?',
      items: [
        { uid: 'home_rent', text: 'Rent', value: 'rent', tagName: 'button' },
        { uid: 'home_own', text: 'Own', value: 'own', tagName: 'button' },
      ],
    },
  ],
};
const answeredHomeCount = await handleRadioAndSurveyOptions(mockHomeFrame, { homeowner: 'own' });
assert.equal(answeredHomeCount, 1);
assert.equal(clickedHomeChoiceId, '[data-autolead-choice-id="home_own"]');

// Test handleOfferwallCards: Phát hiện và mở đồng thời tất cả các offer cards
const clickedOfferwallCards = [];
const mockOfferwallFrame = {
  locator: (sel) => ({
    first: () => ({
      count: async () => 1,
      locator: () => ({
        first: () => ({
          count: async () => 1,
          isVisible: async () => true,
          click: async () => { clickedOfferwallCards.push(sel); },
          evaluate: async () => {},
        }),
      }),
    }),
  }),
  evaluate: async () => [
    { uid: 'card_1', hasBtn: true, destUrl: 'https://offer1.example' },
    { uid: 'card_2', hasBtn: true, destUrl: 'https://offer2.example' },
  ],
};
const openedOfferCount = await handleOfferwallCards(mockOfferwallFrame);
assert.equal(openedOfferCount, 2);
assert.deepEqual(clickedOfferwallCards, [
  '[data-autolead-card-id="card_1"]',
  '[data-autolead-card-id="card_2"]',
]);

// Test findSubmitButton: Phải bỏ qua các nút offerwall
const mockOfferwallBtn = {
  isVisible: async () => true,
  isEnabled: async () => true,
  innerText: async () => 'Continue',
  evaluate: async (fn) => fn({
    closest: (sel) => sel.includes('offerwall-card'),
    classList: { contains: () => true },
    getAttribute: () => 'offer-btn',
  }),
};
const mockRegularSubmitBtn = {
  isVisible: async () => true,
  isEnabled: async () => true,
  innerText: async () => 'Continue',
  evaluate: async (fn) => fn({
    closest: () => null,
    classList: { contains: () => false },
    getAttribute: () => null,
  }),
};
const mockOfferwallSubmitFrame = {
  locator: (sel) => ({
    all: async () => (sel.includes('button[type="submit"]') ? [mockOfferwallBtn, mockRegularSubmitBtn] : []),
  }),
};
const foundSubmit = await findSubmitButton(mockOfferwallSubmitFrame);
assert.equal(foundSubmit, mockRegularSubmitBtn, 'findSubmitButton phải bỏ qua nút offerwall và chọn nút submit hợp lệ tiếp theo');

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

// Test kiểm tra cấu trúc thư mục lưu log và file HTML bền bỉ (không bị mất khi build app)
assert.ok(interactionHtmlDirectory.includes('Library/Application Support/AutoLeadPC/logs/html'));
assert.ok(interactionLogFilePath.endsWith('browser-logs.json'));
assert.equal(typeof countSavedHtmlFiles, 'function');
assert.equal(typeof clearAllLogsAndHtml, 'function');
const htmlCount = await countSavedHtmlFiles();
assert.equal(typeof htmlCount, 'number');
assert.ok(htmlCount >= 0);

// ── Test AI Assist (ai-assist.mjs) ──────────────────────────────────────────
// 1. Test parseActions với các định dạng output khác nhau
const sampleJsonActions = JSON.stringify([
  { action: 'fill', selector: '#first_name', value: 'Jeremy' },
  { action: 'select', selector: '#state', value: 'OK' },
  { action: 'check', selector: '#agree' },
  { action: 'click', selector: 'button.submit-btn' },
]);
assert.deepEqual(parseActions(sampleJsonActions), [
  { action: 'fill', selector: '#first_name', value: 'Jeremy' },
  { action: 'select', selector: '#state', value: 'OK' },
  { action: 'check', selector: '#agree' },
  { action: 'click', selector: 'button.submit-btn' },
]);

// Hỗ trợ markdown code block ```json ... ```
const markdownOutput = `Dưới đây là các action cần làm:
\`\`\`json
[
  {"action":"fill","selector":"#city","value":"Dewey"},
  {"action":"click","selector":"#continue"}
]
\`\`\`
Đã phân tích xong!`;
assert.deepEqual(parseActions(markdownOutput), [
  { action: 'fill', selector: '#city', value: 'Dewey' },
  { action: 'click', selector: '#continue' },
]);

// Mảng rỗng báo không còn gì làm
assert.deepEqual(parseActions('[]'), []);
assert.deepEqual(parseActions('```json\n[]\n```'), []);
// Xử lý text rác không có JSON
assert.deepEqual(parseActions('Không tìm thấy form nào cả.'), []);
assert.deepEqual(parseActions(''), []);
assert.deepEqual(parseActions(null), []);

// 2. Test executeAction
let executedActionLog = [];
const mockAiPage = {
  locator: (sel) => ({
    first: () => ({
      isVisible: async () => true,
      click: async () => { executedActionLog.push(`click:${sel}`); },
      fill: async (val) => { executedActionLog.push(`fill:${sel}:${val}`); },
      selectOption: async (val) => { executedActionLog.push(`select:${sel}:${val}`); },
      check: async () => { executedActionLog.push(`check:${sel}`); },
      evaluate: async (fn) => fn({ dispatchEvent: () => {}, setAttribute: () => {} }),
    }),
  }),
};

const mockSession = { autofillFields: 0 };
await executeAction(mockAiPage, { action: 'fill', selector: '#first_name', value: 'Jeremy' }, mockSession);
assert.equal(mockSession.autofillFields, 1);
assert.ok(executedActionLog.some((e) => e.startsWith('fill:#first_name:Jeremy')));

await executeAction(mockAiPage, { action: 'select', selector: '#state', value: 'OK' }, mockSession);
assert.equal(mockSession.autofillFields, 2);
assert.ok(executedActionLog.some((e) => e.startsWith('select:#state:OK')));

await executeAction(mockAiPage, { action: 'check', selector: '#agree' }, mockSession);
assert.equal(mockSession.autofillFields, 3);
assert.ok(executedActionLog.some((e) => e === 'check:#agree'));

await executeAction(mockAiPage, { action: 'click', selector: '#submit' }, mockSession);
assert.equal(mockSession.autofillFields, 4);
assert.ok(executedActionLog.some((e) => e === 'click:#submit'));

// 3. Test pageHasWork
const mockWorkPage = {
  isClosed: () => false,
  evaluate: async (fn) => fn(),
};
// Trang đã đóng → trả về false
assert.equal(await pageHasWork({ isClosed: () => true }), false);
assert.equal(await pageHasWork(null), false);

// 4. Test attachAutofill: Trigger onStuck khi noProgressRounds >= 3
let stuckTriggered = false;
const mockStuckPageEvents = {};
const mockStuckPage = {
  isClosed: () => false,
  url: () => 'https://example.com/form',
  on: (evt, handler) => { mockStuckPageEvents[evt] = handler; },
  frames: () => [{
    locator: () => ({ all: async () => [] }),
    evaluateAll: async () => ({}),
    evaluate: async () => [],
  }],
};
const mockStuckContext = {
  on: (evt, handler) => { mockStuckPageEvents[evt] = handler; },
  pages: () => [mockStuckPage],
};
const mockSessionStuck = { autofillFields: 0, leadCheckStatus: null };
attachAutofill(mockStuckContext, [{ firstname: 'Jeremy' }], 'https://example.com', mockSessionStuck, {
  onStuck: () => { stuckTriggered = true; },
});
assert.equal(stuckTriggered, false);
// Kích hoạt 3 lần scan không có trường nào điền thêm
mockSessionStuck.triggerAutofillScan?.();
await new Promise((r) => setTimeout(r, 20));
mockSessionStuck.triggerAutofillScan?.();
await new Promise((r) => setTimeout(r, 20));
mockSessionStuck.triggerAutofillScan?.();
await new Promise((r) => setTimeout(r, 20));
assert.equal(stuckTriggered, true, 'Sau 3 vòng scan không có tiến triển phải kích hoạt callback onStuck');

// 5. Test watchTrafficBlockedPage: Xử lý kẹt tại adtrapper (tải lại 1-2 lần, nếu không được thì đóng trình duyệt)
assert.equal(typeof watchTrafficBlockedPage, 'function');
let mockAdtrapperReloadCount = 0;
let mockAdtrapperBrowserClosed = false;
const mockAdtrapperPage = {
  isClosed: () => false,
  url: () => 'https://trk2.adtrapper.com/?pid=582',
  evaluate: async () => null,
  reload: async () => { mockAdtrapperReloadCount += 1; },
  close: async () => {},
};
const mockAdtrapperSession = {
  browser: {
    isClosed: () => mockAdtrapperBrowserClosed,
    pages: async () => [mockAdtrapperPage],
    close: async () => { mockAdtrapperBrowserClosed = true; },
    on: () => {},
  },
  chromeVersion: '150.0.7871.187',
  tileIndex: 0,
  suppressAutoRefill: false,
};
watchTrafficBlockedPage(mockAdtrapperSession);
// Đảm bảo watchTrafficBlockedPage khởi tạo thành công không ném ngoại lệ
assert.equal(mockAdtrapperBrowserClosed, false);

// 6. Test findSubmitButton: Từ chối thẻ IFRAME và container DIV lớn, nhận diện đúng nút Submit/Continue thực tế
const mockIframeBtn = {
  isVisible: async () => true,
  isEnabled: async () => true,
  innerText: async () => '',
  evaluate: async (fn) => fn({
    tagName: 'IFRAME',
    getBoundingClientRect: () => ({ width: 400, height: 600 }),
  }),
};
const mockValidButton = {
  isVisible: async () => true,
  isEnabled: async () => true,
  innerText: async () => 'Continue',
  evaluate: async (fn) => fn({
    tagName: 'BUTTON',
    getBoundingClientRect: () => ({ width: 120, height: 40 }),
    closest: () => null,
  }),
};
const mockFrameWithIframeAndButton = {
  locator: () => ({
    all: async () => [mockIframeBtn, mockValidButton],
  }),
};
const foundValidBtn = await findSubmitButton(mockFrameWithIframeAndButton);
assert.equal(foundValidBtn, mockValidButton, 'findSubmitButton phải loại trừ thẻ IFRAME và chọn nút BUTTON hợp lệ');

// Test findSubmitButton: Gỡ disabled trên nút submit nếu nút bị disabled tạm thời
let disabledRemoved = false;
const mockDisabledSubmitBtn = {
  isVisible: async () => true,
  isEnabled: async () => false,
  innerText: async () => 'Submit',
  evaluate: async (fn) => {
    const el = {
      tagName: 'BUTTON',
      disabled: true,
      removeAttribute: () => { disabledRemoved = true; },
      classList: { remove: () => {} },
      setAttribute: () => {},
    };
    return fn(el);
  },
};
const mockFrameWithDisabledBtn = {
  locator: (sel) => ({
    all: async () => (sel.includes('button[type="submit"]') ? [mockDisabledSubmitBtn] : []),
  }),
};
const foundDisabledBtn = await findSubmitButton(mockFrameWithDisabledBtn);
assert.equal(foundDisabledBtn, mockDisabledSubmitBtn, 'findSubmitButton phải nhận diện và gỡ disabled trên nút submit');
assert.equal(disabledRemoved, true, 'Thuộc tính disabled phải được gỡ bỏ khỏi nút submit');

// 7. Test tự động chuẩn hóa email thiếu @ và sinh email hợp lệ khi khuyết
const rawKendra = {
  firstname: 'Kendra',
  lastname: 'Wardlaw',
  email: 'KendraWardlaw5138274',
  phone: '3077420430',
  ziporpostcode: '99654',
  stateorprovince: 'AK',
};
const matchedKendraEmail = matchFieldValue(['email'], rawKendra, { type: 'email' });
assert.equal(matchedKendraEmail, 'KendraWardlaw5138274@gmail.com', 'Email thiếu @ phải được tự động bổ sung @gmail.com');

const rawNoEmailRecord = {
  firstname: 'Kendra',
  lastname: 'Wardlaw',
  phone: '3077420430',
  state: 'AK',
};
const generatedEmail = matchFieldValue(['email'], rawNoEmailRecord, { type: 'email' });
assert.equal(generatedEmail, 'kendra.wardlaw0430@gmail.com', 'Record thiếu email phải tự động sinh email hợp lệ');

// 8. Test nhận diện Zip Code từ cột ziporpostcode và fallback mã zip theo state
const matchedKendraZip = matchFieldValue(['zipcode', 'zip'], rawKendra);
assert.equal(matchedKendraZip, '99654', 'Phải đọc được zip code từ trường ziporpostcode');

const rawMissingZip = {
  state: 'AK',
};
const fallbackZip = matchFieldValue(['zipcode'], rawMissingZip);
assert.equal(fallbackZip, '99654', 'Record thiếu zip code phải tự động lấy mã zip hợp lệ của bang AK');

// 9. Test Hàng đợi Email mẫu và ưu tiên email mẫu khi tự điền form
// 9.1 isEmailFieldName
assert.equal(isEmailFieldName('email'), true);
assert.equal(isEmailFieldName('email_address'), true);
assert.equal(isEmailFieldName('Email Address'), true);
assert.equal(isEmailFieldName('confirm_email'), true);
assert.equal(isEmailFieldName('user_email'), true);
assert.equal(isEmailFieldName('mail'), true);
assert.equal(isEmailFieldName('thudientu'), true);
assert.equal(isEmailFieldName('mailing_address'), false);
assert.equal(isEmailFieldName('mail_address'), false);
assert.equal(isEmailFieldName('mailbox'), false);
assert.equal(isEmailFieldName('username'), false);
assert.equal(isEmailFieldName('zipcode'), false);

// 9.2 parseEmailLine
assert.equal(parseEmailLine('daj.gomezramirez@gmail.com'), 'daj.gomezramirez@gmail.com');
assert.equal(parseEmailLine('daj.gomezramirez@gmail.com|||Gmail.txt|Live'), 'daj.gomezramirez@gmail.com');
assert.equal(parseEmailLine('User.123+promo@Sub.Domain.COM:pass123'), 'user.123+promo@sub.domain.com');
assert.equal(parseEmailLine('# ghi chu'), null);
assert.equal(parseEmailLine(''), null);
assert.equal(parseEmailLine('khong_co_email_o_day'), null);

// 9.3 importEmailLines & dequeueNextEmail
emailQueue.available = [];
emailQueue.used = [];
const importedCount = importEmailLines([
  'first.lead@gmail.com',
  'second.lead@gmail.com',
  'first.lead@gmail.com', // trùng
  '# comment',
  'third.lead@gmail.com|||Live',
]);
assert.equal(importedCount, 3);
assert.equal(emailQueue.available.length, 3);
assert.equal(emailQueue.used.length, 0);

const firstDequeued = dequeueNextEmail();
assert.equal(firstDequeued, 'first.lead@gmail.com');
assert.equal(emailQueue.available.length, 2);
assert.equal(emailQueue.used.length, 1);

const secondDequeued = dequeueNextEmail();
assert.equal(secondDequeued, 'second.lead@gmail.com');
const thirdDequeued = dequeueNextEmail();
assert.equal(thirdDequeued, 'third.lead@gmail.com');

// Khi hết available nhưng có used -> tự động quay vòng danh sách
const recycledEmail = dequeueNextEmail();
assert.equal(recycledEmail, 'first.lead@gmail.com');
assert.equal(emailQueue.used.length, 1);

// 9.4 matchFieldValue ưu tiên tuyệt đối assignedEmail khi điền ô email
const sampleUserEmail = 'daj.gomezramirez@gmail.com';
const kendraWithAssignedEmail = {
  ...rawKendra,
  assignedEmail: sampleUserEmail,
};
const filledEmailWithAssigned = matchFieldValue(['email'], kendraWithAssignedEmail, { type: 'email' });
assert.equal(filledEmailWithAssigned, sampleUserEmail, 'matchFieldValue phải ưu tiên assignedEmail thay vì email/username trong record');

const filledConfirmEmail = matchFieldValue(['confirm_email'], rawKendra, { assignedEmail: sampleUserEmail });
assert.equal(filledConfirmEmail, sampleUserEmail, 'Ô confirm_email phải nhận đúng assignedEmail truyền qua metadata');

// 9.5 attachAutofill gán assignedEmail vào record của session
const mockSampleContext = {
  on: () => {},
  pages: () => [],
};
const mockSampleSession = {
  assignedEmail: 'assigned.tester@gmail.com',
};
let pickedRecordResult = null;
attachAutofill(mockSampleContext, [{ firstname: 'John', email: 'john_raw@example.com' }], 'https://example.com', mockSampleSession, {
  onRecordPicked: (rec) => { pickedRecordResult = rec; },
});
assert.equal(pickedRecordResult?.email, 'assigned.tester@gmail.com', 'attachAutofill phải cập nhật record.email thành session.assignedEmail');
assert.equal(pickedRecordResult?.assignedEmail, 'assigned.tester@gmail.com');

// ─── 10. KIỂM TRA CHẾ ĐỘ NHIỀU THIẾT BỊ GIẢ ĐỊNH (DEVICE PROFILES) ──────────────
// 10.1 Cấu trúc đầy đủ của 6 thiết bị giả định
const expectedProfiles = ['windows', 'macos', 'linux', 'android', 'ipad', 'ios'];
for (const pid of expectedProfiles) {
  assert.ok(DEVICE_PROFILES[pid], `Thiếu cấu hình thiết bị: ${pid}`);
  const dp = DEVICE_PROFILES[pid];
  assert.ok(typeof dp.label === 'string' && dp.label.length > 0, `Thiếu label cho ${pid}`);
  assert.ok(typeof dp.ua === 'function', `Thiếu hàm sinh userAgent cho ${pid}`);
  assert.ok(typeof dp.isMobile === 'boolean', `Thiếu isMobile cho ${pid}`);
  assert.ok(typeof dp.hasTouch === 'boolean', `Thiếu hasTouch cho ${pid}`);
  assert.ok(typeof dp.deviceScaleFactor === 'number' && dp.deviceScaleFactor > 0, `Thiếu deviceScaleFactor cho ${pid}`);
  assert.ok(dp.spoof, `Thiếu spoof cho ${pid}`);
  assert.ok(typeof dp.spoof.platform === 'string', `Thiếu spoof.platform cho ${pid}`);
  assert.ok(typeof dp.spoof.uaPlatform === 'string', `Thiếu spoof.uaPlatform cho ${pid}`);
  assert.ok(typeof dp.spoof.vendor === 'string', `Thiếu spoof.vendor cho ${pid}`);
}

// 10.2 Tính nhất quán chống phát hiện bot
// iOS và iPad (Safari) phải có vendor Apple, platform iOS và không được để lộ vendor Google
assert.equal(DEVICE_PROFILES.ios.spoof.vendor, 'Apple Computer, Inc.');
assert.equal(DEVICE_PROFILES.ipad.spoof.vendor, 'Apple Computer, Inc.');
assert.equal(DEVICE_PROFILES.ios.spoof.uaPlatform, 'iOS');
assert.equal(DEVICE_PROFILES.ipad.spoof.uaPlatform, 'iOS');

// Android, Windows, macOS, Linux phải có vendor Google Inc.
assert.equal(DEVICE_PROFILES.android.spoof.vendor, 'Google Inc.');
assert.equal(DEVICE_PROFILES.windows.spoof.vendor, 'Google Inc.');
assert.equal(DEVICE_PROFILES.macos.spoof.vendor, 'Google Inc.');
assert.equal(DEVICE_PROFILES.linux.spoof.vendor, 'Google Inc.');

// Mobile devices phải có viewport kích thước chuẩn điện thoại/tablet
assert.ok(DEVICE_PROFILES.android.viewport.width === 412 && DEVICE_PROFILES.android.viewport.height === 915);
assert.ok(DEVICE_PROFILES.ios.viewport.width === 390 && DEVICE_PROFILES.ios.viewport.height === 844);
assert.ok(DEVICE_PROFILES.ipad.viewport.width === 820 && DEVICE_PROFILES.ipad.viewport.height === 1180);

// Desktop devices viewport là null để khớp cửa sổ
assert.equal(DEVICE_PROFILES.windows.viewport, null);
assert.equal(DEVICE_PROFILES.macos.viewport, null);
assert.equal(DEVICE_PROFILES.linux.viewport, null);

// 10.3 Kiểm tra cơ chế xoay vòng thiết bị getNextDeviceProfile()
resetDeviceProfileRotation();
autoRefill.deviceProfiles = ['windows', 'macos', 'android'];

assert.equal(getNextDeviceProfile(), 'windows', 'Lần 1 phải lấy windows');
assert.equal(getNextDeviceProfile(), 'macos', 'Lần 2 phải lấy macos');
assert.equal(getNextDeviceProfile(), 'android', 'Lần 3 phải lấy android');
assert.equal(getNextDeviceProfile(), 'windows', 'Lần 4 phải quay vòng lại windows');
assert.equal(getNextDeviceProfile(), 'macos', 'Lần 5 phải quay vòng lại macos');

// Khi chỉ chọn 1 thiết bị: mọi lần gọi đều trả về thiết bị đó
resetDeviceProfileRotation();
autoRefill.deviceProfiles = ['ios'];
assert.equal(getNextDeviceProfile(), 'ios');
assert.equal(getNextDeviceProfile(), 'ios');

// Phục hồi lại mặc định
resetDeviceProfileRotation();
autoRefill.deviceProfiles = ['windows'];

// 10.4 Kiểm tra sinh User-Agent khớp phiên bản Chrome cho Mobile và iOS
assert.ok(DEVICE_PROFILES.android.ua('150.0.7871.187').includes('Chrome/150.0.7871.187'), 'Android UA phải chứa Chrome/150');
assert.ok(DEVICE_PROFILES.ios.ua('151.0.7922.174').includes('CriOS/151.0.7922.174'), 'iOS UA phải chứa CriOS/151');
assert.ok(DEVICE_PROFILES.ipad.ua('152.0.7977.83').includes('CriOS/152.0.7977.83'), 'iPad UA phải chứa CriOS/152');




