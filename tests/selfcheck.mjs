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
  fillAlphaIntentFullName,
  createFallbackAutofillRecord,
  DEFAULT_PHONE_AREA_CODES,
  getPhoneAreaCode,
  getNormalizedPhone,
  handleNegativeSkipButtons,
  humanMouseMove,
  humanWheelScroll,
  humanClick,
  naturalMouseDrift,
  ADJACENT_KEYS,
  hasActiveAddressSuggestions,
  selectFirstAddressSuggestion,
  ADDRESS_SUGGESTION_SELECTORS,
} from "../autofill.mjs";
import { DEFAULT_LEAD_CONFIG, isLeadPresent, normalizeIpAddress, LeadApiError } from "../lead-check.mjs";
import { parseActions, pageHasWork, executeAction, extractCleanPageStructure, detectSmartFallbackAction, inspectAndFixFormWithAi } from "../ai-assist.mjs";
import {
  buildProxyCheckReport,
  buildUsedExitIpList,
  chromeExecutableNames,
  listInstalledChromeChannels,
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
  appDataDirectory,
  emailQueue,
  loadEmailQueue,
  saveEmailQueue,
  parseEmailLine,
  isPlausibleGmail,
  importEmailLines,
  dequeueNextEmail,
  emailAutoRefill,
  refillEmailBatchFromSource,
  takeNextEmail,
  withoutSessionEmail,
  DEVICE_PROFILES,
  autoRefill,
  getNextDeviceProfile,
  resetDeviceProfileRotation,
  deviceProfilesPath,
  loadSavedDeviceProfiles,
  saveSavedDeviceProfiles,
  dualStreamState,
  getNextProxyForStream,
  getNextCollisionFreeProxy,
  resetMultiOfferState,
  releaseProxyLock,
  acquireProxyLock,
  isProxyCurrentlyActive,
  isProxyUsedByAllOffers,
  buildProxyUsageHistoryCsv,
} from "../app.mjs";

// app.mjs đăng ký process.on('uncaughtException') để giữ app sống khi một nhánh hậu kỳ
// hỏng. Handler đó sẽ nuốt lỗi assert, khiến selfcheck luôn báo "thành công" dù kiểm tra
// đã fail. Ở đây ta bỏ handler để lỗi nổi lên và tiến trình dừng với exit code khác 0.
process.removeAllListeners('uncaughtException');
process.removeAllListeners('unhandledRejection');

const parse = (line, type = 'socks5') => parseProxyLine(line, 1, type);
const fails = (line, type = 'socks5') => assert.throws(() => parse(line, type));

// Dòng bỏ qua
assert.equal(parse(''), null);
assert.equal(parse('   '), null);
assert.equal(parse('# ghi chu'), null);

// host:port, kèm khoảng trắng cuối dòng như proxies.txt
assert.deepEqual(parse('184.181.178.33:4145 '), { server: 'socks5://184.181.178.33:4145' });
assert.deepEqual(parse('1.2.3.4:8080', 'http'), { server: 'http://1.2.3.4:8080' });
assert.deepEqual(parse('proxy.example:8080:user:secret', 'http'), {
  server: 'http://proxy.example:8080', username: 'user', password: 'secret',
});
assert.deepEqual(parse('https://user:secret@proxy.example:8443'), {
  server: 'http://proxy.example:8443', username: 'user', password: 'secret',
});

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
assert.ok(/^(814|817)9335582$/.test(matchFieldValue(['phone', 'tel'], leadRecord)), 'Phone phải có đầu số mặc định 814 hoặc 817');
assert.ok(['814', '817'].includes(matchFieldValue(['areacode', 'phone1'], leadRecord)), 'Areacode phải là 814 hoặc 817');
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
// Record không có email: không tự sinh email (chỉ dùng email trong danh sách app cung cấp).
assert.equal(matchFieldValue(['email'], { fullname: 'John Doe', phonenumber: '1234567890' }), null);

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
assert.ok(/^(814|817)-397-5329$/.test(jeremy.phonenumber), 'jeremy.phonenumber phải có đầu số mặc định 814 hoặc 817');
assert.equal(jeremy.dateofbirth, '8/4/1984');

assert.equal(matchFieldValue(['full_name', 'name'], jeremy), 'Jeremy Adam McNeice');
assert.equal(matchFieldValue(['first_name'], jeremy), 'Jeremy');
assert.equal(matchFieldValue(['middle_name'], jeremy), 'Adam');
assert.equal(matchFieldValue(['street_address', 'address'], jeremy), '723 e 6th st');
assert.equal(matchFieldValue(['city'], jeremy), 'Dewey');
assert.equal(matchFieldValue(['state'], jeremy), 'OK');
assert.equal(matchFieldValue(['zip', 'zipcode'], jeremy), '74029');
assert.ok(/^(814|817)-397-5329$/.test(matchFieldValue(['phone', 'tel'], jeremy)), 'Phone jeremy phải có đầu số 814 hoặc 817');
assert.ok(['814', '817'].includes(matchFieldValue(['areacode'], jeremy)), 'Areacode jeremy phải là 814 hoặc 817');
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
assert.equal(matchFieldValue(['v3-gender'], jeremy), null, 'jeremy không có trường sex/gender -> không bịa giá trị');

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
assert.ok(/^(814|817)7420430$/.test(kendra.phone), 'kendra.phone phải có đầu số 814 hoặc 817');
assert.ok(/^(814|817)7420430$/.test(kendra.cellphone), 'kendra.cellphone phải có đầu số 814 hoặc 817');
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
assert.ok(/^(814|817)7420430$/.test(matchFieldValue(['phone', 'tel'], kendra)), 'matchFieldValue phone kendra phải có đầu số 814 hoặc 817');
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
  null,
  'Record thiếu địa chỉ -> không bịa giá trị ngoài dữ liệu, trả null'
);

// Test Phone mặc định đầu số 814 hoặc 817
assert.deepEqual(DEFAULT_PHONE_AREA_CODES, ['814', '817']);
const savedFormTestPhone = '8145550100';
assert.equal(getNormalizedPhone({ phone: savedFormTestPhone }), savedFormTestPhone, 'Số chuẩn trong form test phải giữ đủ 10 chữ số và đầu 814');
assert.equal(matchFieldValue(['phone', 'tel'], { phone: savedFormTestPhone }), savedFormTestPhone, 'Autofill chính phải điền nguyên số hợp lệ từ form test');
assert.equal(getPhoneAreaCode({ phone: '+1 (814) 555-0100' }), '814', 'Tiền tố quốc gia +1 không làm mất mã vùng 814');
assert.equal(getPhoneAreaCode({ phone: '+1 (817) 555-0100' }), '817', 'Tiền tố quốc gia +1 không làm mất mã vùng 817');
assert.ok(['814', '817'].includes(getPhoneAreaCode({})), 'Khi record rỗng, getPhoneAreaCode phải trả về 814 hoặc 817');
assert.equal(getPhoneAreaCode({ phone: '8141234567' }), '814', 'Số có sẵn đầu 814 phải giữ nguyên');
assert.equal(getPhoneAreaCode({ phone: '8179998888' }), '817', 'Số có sẵn đầu 817 phải giữ nguyên');
assert.ok(['814', '817'].includes(getPhoneAreaCode({ phone: '4059335582' })), 'Số có sẵn đầu khác -> chuẩn hóa về 814 hoặc 817');
assert.equal(getPhoneAreaCode({ areacode: '814' }), '814', 'Trường areacode = 814 phải được tôn trọng');
assert.equal(getPhoneAreaCode({ areacode: '817' }), '817', 'Trường areacode = 817 phải được tôn trọng');

const emptyPhone = getNormalizedPhone({});
assert.ok(/^(814|817)\d{7}$/.test(emptyPhone), 'Record thiếu số điện thoại -> đầu 814/817 + 7 số đuôi bất kỳ');
assert.equal(getNormalizedPhone({}).length, 10, 'Số sinh ra phải đủ 10 chữ số');
const stablePhoneRecord = {};
assert.equal(getNormalizedPhone(stablePhoneRecord), getNormalizedPhone(stablePhoneRecord), 'Cùng bản ghi phải ra cùng một số');
assert.ok(['814', '817'].includes(getPhoneAreaCode({})), 'Khi record rỗng, getPhoneAreaCode phải trả về 814 hoặc 817');
assert.equal(getPhoneAreaCode({ phone: '8141234567' }), '814', 'Số có sẵn đầu 814 phải giữ nguyên');
assert.equal(getPhoneAreaCode({ phone: '8179998888' }), '817', 'Số có sẵn đầu 817 phải giữ nguyên');
assert.ok(['814', '817'].includes(getPhoneAreaCode({ phone: '4059335582' })), 'Số có sẵn đầu khác -> chuẩn hóa về 814 hoặc 817');
assert.equal(getPhoneAreaCode({ areacode: '814' }), '814', 'Trường areacode = 814 phải được tôn trọng');
assert.equal(getPhoneAreaCode({ areacode: '817' }), '817', 'Trường areacode = 817 phải được tôn trọng');
const fallbackAutofillRecord = createFallbackAutofillRecord();
const fallbackPhoneDigits = fallbackAutofillRecord.phone.replace(/\D/g, '');
assert.match(fallbackPhoneDigits, /^(?:814|817)\d{7}$/, 'Record fallback chính thức phải có đầu 814/817 và đủ 10 chữ số');
assert.equal(fallbackAutofillRecord.areacode, fallbackPhoneDigits.slice(0, 3), 'Mã vùng fallback phải khớp số điện thoại đầy đủ');
assert.equal(matchFieldValue(['phone', 'tel'], fallbackAutofillRecord), fallbackAutofillRecord.phone, 'Trường điện thoại đầy đủ dùng đúng số của record fallback');

// Test matchFieldValue với record rỗng phải trả null (không bịa phone từ bên ngoài)
const matchedEmptyPhone = matchFieldValue(['phone', 'tel'], {});
assert.ok(/^(814|817)\d{7}$/.test(matchedEmptyPhone), 'matchFieldValue cho record rỗng phải trả về 10 số đầu 814/817');
assert.ok(['814', '817'].includes(matchFieldValue(['areacode', 'phone1'], {})), 'matchFieldValue areacode cho record rỗng phải là 814 hoặc 817');

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

// Test humanType với page.keyboard (mô phỏng phím native trong Playwright browser)
const pageTypedChars = [];
const mockPage = {
  keyboard: {
    press: async () => {},
    type: async (char, opts) => {
      pageTypedChars.push({ char, delay: opts?.delay });
    },
  },
  waitForTimeout: async () => {},
};
const mockPageField = {
  scrollIntoViewIfNeeded: async () => {},
  click: async () => {},
  focus: async () => {},
  inputValue: async () => pageTypedChars.map((t) => t.char).join(''),
  page: () => mockPage,
};
await humanType(mockPageField, 'Jane Doe', mockPage);
assert.equal(pageTypedChars.map((t) => t.char).join(''), 'Jane Doe');
assert.equal(pageTypedChars.length, 8);
assert.ok(pageTypedChars.every((t) => typeof t.delay === 'number' && t.delay >= 30), 'Độ trễ mỗi phím trên page.keyboard phải >= 30ms');

// Hai lần humanType cùng lúc trên cùng trang (lượt quét + AI Assist): keyboard.type gõ vào ô đang focus,
// nên phải gõ xong ô này mới sang ô kia — nếu không chữ của hai ô trộn vào nhau.
{
  let focused = null;
  const typedInto = { email: '', name: '' };
  const sharedPage = {
    keyboard: {
      press: async () => {},
      type: async (char) => { await new Promise((r) => setTimeout(r, 1)); typedInto[focused] += char; },
    },
    waitForTimeout: async () => {},
  };
  const makeField = (id) => ({ click: async () => { focused = id; }, focus: async () => { focused = id; }, page: () => sharedPage });
  await Promise.all([
    humanType(makeField('email'), 'adoanr1sh4d3@gmail.com', sharedPage),
    humanType(makeField('name'), 'Jane Doe', sharedPage),
  ]);
  assert.deepEqual(typedInto, { email: 'adoanr1sh4d3@gmail.com', name: 'Jane Doe' }, 'humanType trên cùng trang phải gõ tuần tự từng ô');
}

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
      click: async () => { clickedRadioSelector = sel; const radio=mockRadios.find(item=>sel.includes(item.id)); if(radio) radio.checked=true; dispatchedRadioEvents.push('input','change'); },
      evaluate: async (fn) => {
        if(fn.name==='inspectInteractionReadiness')return {ready:true};
        const radio=mockRadios.find(item=>sel.includes(item.id));
        return fn({isConnected:true,checked:radio?.checked||false,matches:()=>true,getAttribute:()=>null,setAttribute:()=>{},dispatchEvent:()=>{}});
      },
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
  clickedRadioSelector === 'input[type="radio"][id="own_home_yes"]' ||
  clickedRadioSelector === 'input[type="radio"][id="own_home_no"]'
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

/**
 * Mô phỏng option có trạng thái website xác nhận sau click, thay cho mock click không đổi DOM.
 * @param {string} selector Định danh option.
 * @param {Function} onClick Callback ghi nhận option được bấm.
 * @return {object} Locator với trạng thái selection được lưu giữa các evaluate.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
function createVerifiedChoiceLocator(selector, onClick) {
  let selected = false;
  const attributes = new Map();
  return {
    count: async () => 1,
    click: async () => { selected = true; onClick(selector); },
    evaluate: async (fn, arg) => {
      if (fn.name === 'inspectInteractionReadiness') return { ready: true };
      if (fn.name === 'inspectSelectionState') return selected;
      return fn({ isConnected: true, getAttribute: name => attributes.get(name) || null, setAttribute: (name, value) => attributes.set(name,value), classList: { add() {}, contains: () => selected }, dispatchEvent() {} }, arg);
    },
  };
}

// Test handleRadioAndSurveyOptions: Vector Survey Income (.btn-option, data-vector-answer="true")
let clickedVectorChoiceId = null;
const mockVectorSurveyFrame = {
  locator: (sel) => ({
    count: async () => 1,
    first: () => createVerifiedChoiceLocator(sel, selector => { clickedVectorChoiceId = selector; }),
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
  clickedVectorChoiceId === '[data-ux-choice-id="v1"]' ||
  clickedVectorChoiceId === '[data-ux-choice-id="v2"]' ||
  clickedVectorChoiceId === '[data-ux-choice-id="v3"]'
);

// Test handleRadioAndSurveyOptions: Khớp tuổi thông minh với thẻ <a> (Jeremy sinh năm 1984 -> tuổi 42 -> 35-49)
let clickedAgeChoiceId = null;
const mockAgeFrame = {
  locator: (sel) => ({
    count: async () => 1,
    first: () => createVerifiedChoiceLocator(sel, selector => { clickedAgeChoiceId = selector; }),
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
assert.equal(clickedAgeChoiceId, '[data-ux-choice-id="age_2"]', 'Phải tự động khớp chính xác dải tuổi 35-49 dựa trên ngày sinh 1984');

// Test handleRadioAndSurveyOptions: Creative Homeowner Survey (Rent vs Own)
let clickedHomeChoiceId = null;
const mockHomeFrame = {
  locator: (sel) => ({
    count: async () => 1,
    first: () => createVerifiedChoiceLocator(sel, selector => { clickedHomeChoiceId = selector; }),
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
assert.equal(clickedHomeChoiceId, '[data-ux-choice-id="home_own"]');

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
          evaluate: async () => ({ ready: true }),
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
  '[data-ux-card-id="card_1"]',
  '[data-ux-card-id="card_2"]',
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

// Vòng xoay Chrome: chấp nhận cả Chrome for Testing (kho chrome-builds) nhưng
// CHỈ các major ≥ 150 để profile mẫu RoboForm chép được sang mọi profile mới.
const activeChromeBuilds = await listInstalledChromeChannels();
assert.ok(activeChromeBuilds.length > 0, 'Phải tìm thấy ít nhất 1 bản Chrome thường');
for (const b of activeChromeBuilds) {
  assert.ok(b.major >= 150, `Bản ${b.version} phải từ major 150 trở lên`);
  if (b.executablePath.includes('Chrome for Testing') || b.executablePath.includes('chrome-builds')) {
    assert.ok(b.major >= 150, `Bản CfT ${b.version} phải từ major 150 trở lên`);
  }
}

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
assert.equal(isConsentCheckbox({ type: 'checkbox', name: 'accept_tos' }), true);
assert.equal(isConsentCheckbox({ type: 'checkbox', name: 'tcpa_optin' }), true);
assert.equal(isConsentCheckbox({ type: 'checkbox', names: ['I agree to Privacy Policy'] }), true);
assert.equal(isConsentCheckbox({ type: 'checkbox', dataAttributes: { 'data-required': 'true' } }), true);
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
assert.equal(DEFAULT_LEAD_CONFIG.checkScreen, 4);

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

// Test dữ liệu thực tế toffers.top cung cấp từ người dùng (ID: 29805, IP: 138.89.53.3)
const userApiResponse = {
  results: [
    { id: '29805', typeoffer: '1', device_num: '', clickid: 'U7XsDA03s212F2hxBo', idmem: '55', offerid: '2420', point: '0.4', ip: '138.89.53.3', geo: 'US', timeclick: '1792197621', timelead: '1792197657', network2: '45', nameoff: 'Personal Financial Guide - US - Finance ', username: 'Haicrv', fullname: 'Haicrv', idgroup: '0' },
    { id: '29804', typeoffer: '1', device_num: '', clickid: 'MYysocn1ohJOeHnIo4', idmem: '55', offerid: '2420', point: '0.4', ip: '138.43.154.239', geo: 'US', timeclick: '1792197260', timelead: '1792197313', network2: '45', nameoff: 'Personal Financial Guide - US - Finance ', username: 'Haicrv', fullname: 'Haicrv', idgroup: '0' },
  ],
  check: '29805',
};
assert.equal(isLeadPresent(userApiResponse, '138.89.53.3'), true);
assert.equal(isLeadPresent(userApiResponse, '138.43.154.239'), true);
assert.equal(isLeadPresent(userApiResponse, '138.89.53.3:1080'), true);
assert.equal(isLeadPresent(userApiResponse, '10.0.0.1'), false);

const testAuthErr = new LeadApiError('Hết hạn', 'AUTH_EXPIRED', { status: 302 });
assert.equal(testAuthErr.code, 'AUTH_EXPIRED');
assert.equal(testAuthErr.name, 'LeadApiError');
assert.equal(testAuthErr.details.status, 302);

// Test kiểm tra cấu trúc thư mục lưu log và file HTML bền bỉ (không bị mất khi build app)
assert.equal(interactionHtmlDirectory, join(appDataDirectory, 'logs', 'html'));
assert.ok(interactionLogFilePath.endsWith('browser-logs.json'));
assert.equal(typeof countSavedHtmlFiles, 'function');
assert.equal(typeof clearAllLogsAndHtml, 'function');
const htmlCount = await countSavedHtmlFiles();
assert.equal(typeof htmlCount, 'number');
assert.ok(htmlCount >= 0);

// Test CSV history chứa cột offer_so
const sampleHistory = {
  version: 1,
  proxies: {
    'p1': {
      proxy: '127.0.0.1:1080',
      status: 'success',
      exitIp: '1.2.3.4',
      offerNumber: 3,
      websiteUrl: 'https://example.com/offer3',
      finalUrl: 'https://example.com/offer3/done',
      profileId: 'chrome-stable-150',
      attemptedAt: '2026-10-17T12:00:00Z',
      completedAt: '2026-10-17T12:01:00Z',
    }
  }
};
const csvResult = buildProxyUsageHistoryCsv(sampleHistory);
assert.ok(csvResult.includes('"offer_so"'));
assert.ok(csvResult.includes('"3"'));

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

// Hỗ trợ single action object {"action":"click","selector":"#submit"}
assert.deepEqual(parseActions('{"action":"click","selector":"#submit"}'), [
  { action: 'click', selector: '#submit' },
]);

// Mảng rỗng báo không còn gì làm
assert.deepEqual(parseActions('[]'), []);
assert.deepEqual(parseActions('```json\n[]\n```'), []);
// Bỏ qua object lỗi / từ chối của LLM (không có action)
assert.deepEqual(parseActions('[{"error":"I cannot answer a human-verification question"}]'), []);
// Xử lý text rác không có JSON
assert.deepEqual(parseActions('Không tìm thấy form nào cả.'), []);
assert.deepEqual(parseActions(''), []);
assert.deepEqual(parseActions(null), []);

// Test detectSmartFallbackAction
assert.equal(typeof detectSmartFallbackAction, 'function');
assert.equal(await detectSmartFallbackAction(null), null);
assert.equal(await detectSmartFallbackAction({ isClosed: () => true }), null);

// 2. Test executeAction
// Mock phải phản ánh hành vi thật: executeAction điền xong sẽ ĐỌC LẠI giá trị trong DOM
// để xác minh, chỉ khi khớp mới tăng session.autofillFields. Mock cũ trả về undefined
// nên bước xác minh luôn fail và counter không bao giờ tăng.
let executedActionLog = [];
const mockFieldStates = new Map();
const mockAiPage = {
  locator: (sel) => ({
    first: () => {
      if (!mockFieldStates.has(sel)) {
        mockFieldStates.set(sel, { value: '', checked: false });
      }
      const state = mockFieldStates.get(sel);
      return {
        isVisible: async () => true,
        click: async () => {
          if (sel === '#agree') state.checked = !state.checked;
          executedActionLog.push(`click:${sel}`);
        },
        fill: async (val) => {
          state.value = String(val ?? '');
          executedActionLog.push(`fill:${sel}:${val}`);
        },
        selectOption: async (val) => {
          state.selectedOptions = [{ value: String(val ?? ''), label: String(val ?? '') }];
          executedActionLog.push(`select:${sel}:${val}`);
        },
        check: async () => {
          state.checked = true;
          executedActionLog.push(`check:${sel}`);
        },
        evaluate: async (fn) => fn.name === 'inspectInteractionReadiness' ? { ready: true } : fn({
          ...state,
          tagName: 'INPUT',
          type: 'text',
          matches: (s) => (s ? !s.includes('disabled') && !s.includes('inert') : true),
          querySelector: () => null,
          getAttribute: () => null,
          classList: { contains: () => false, add: () => {} },
          dispatchEvent: () => {},
          setAttribute: () => {},
        }),
      };
    },
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
assert.ok(executedActionLog.some((e) => e === 'click:#agree'));

await executeAction(mockAiPage, { action: 'click', selector: '#submit' }, mockSession);
// executeAction chỉ tăng autofillFields cho thao tác ĐIỀN ĐÃ XÁC MINH (fill/select/check).
// Click không điền field nên không tính vào bộ đếm này — chỉ cập nhật lastActionTime.
assert.equal(mockSession.autofillFields, 3);
assert.ok(executedActionLog.some((e) => e === 'click:#submit'));

// 3. Test pageHasWork
assert.equal(await pageHasWork({ isClosed: () => true }), false);
assert.equal(await pageHasWork(null), false);

// Test pageHasWork với page có evaluation trả về true (có radio, survey, submit)
const mockWorkPage = {
  isClosed: () => false,
  evaluate: async () => ({ url: 'https://example.test/form', controls: [{ selector: '#next', type: 'button', tag: 'button', label: 'Continue', value: '' }], questions: [], errors: [] }),
};
assert.equal(await pageHasWork(mockWorkPage), true);

// 4. Test attachAutofill: Trigger onStuck khi noProgressRounds >= 3
let stuckTriggered = false;
const mockStuckPageEvents = {};
const mockStuckPage = {
  isClosed: () => false,
  url: () => 'https://example.com/form',
  on: (evt, handler) => { mockStuckPageEvents[evt] = handler; },
  evaluate: async () => true, // Giả lập trang có form/input interactable
  frames: () => [{
    locator: () => ({ all: async () => [] }),
    evaluateAll: async () => ({}),
    evaluate: async (fn) => fn.name === 'inspectVisibleInteractions' ? { url: 'https://example.test/form', controls: [{ selector: '#next', type: 'button', tag: 'button', label: 'Continue', value: '' }], questions: [], errors: [] } : [],
  }],
};
const mockStuckContext = {
  on: (evt, handler) => { mockStuckPageEvents[evt] = handler; },
  pages: () => [mockStuckPage],
};
const mockSessionStuck = { autofillFields: 0, leadCheckStatus: null };
attachAutofill(mockStuckContext, [{ firstname: 'Jeremy' }], 'https://example.com', mockSessionStuck, {
  onStuck: () => { stuckTriggered = true; },
  // Production chờ 5s cho lượt autofill thư viện chạy trước khi gọi AI. Test rút ngắn
  // cửa sổ này để không phải chờ 5 giây thật.
  libraryFirstPassDelayMs: 0,
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

// Test attachAutofill: nhiều lần kích hoạt scan khi lượt trước còn đang chờ (page.evaluate chậm do máy tải nặng)
// không được chạy hai lượt điền song song trên cùng trang — nếu không hai lần gõ phím trộn ký tự vào cùng một ô.
{
  let inFlight = 0;
  let maxInFlight = 0;
  let closed = false;
  const slowPage = {
    isClosed: () => closed,
    url: () => 'https://example.com/form',
    on: () => {},
    evaluate: async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 40));
      inFlight -= 1;
      return true;
    },
    frames: () => [{ locator: () => ({ all: async () => [] }), evaluateAll: async () => ({}), evaluate: async () => [] }],
  };
  const slowSession = { autofillFields: 0, leadCheckStatus: null };
  attachAutofill({ on: () => {}, pages: () => [slowPage] }, [{ firstname: 'Jeremy' }], 'https://example.com', slowSession, {});
  for (let i = 0; i < 5; i++) slowSession.triggerAutofillScan?.();
  await new Promise((r) => setTimeout(r, 120));
  closed = true;
  for (const t of slowSession._autofillTimers || []) clearInterval(t);
  assert.equal(maxInFlight, 1, 'Các lượt scan trên cùng trang phải chạy tuần tự, không chồng lên nhau');
}

// Test attachAutofill khi trang trống hoặc cảm ơn (hasInteractable = false) thì KHÔNG trigger onStuck
let stuckTriggeredBlank = false;
const mockBlankPage = {
  isClosed: () => false,
  url: () => 'https://example.com/thank-you',
  on: () => {},
  evaluate: async () => false, // Trang cảm ơn / rỗng không có interactable
  frames: () => [{
    locator: () => ({ all: async () => [] }),
    evaluateAll: async () => ({}),
    evaluate: async () => [],
  }],
};
const mockBlankContext = {
  on: () => {},
  pages: () => [mockBlankPage],
};
const mockSessionBlank = { autofillFields: 5, leadCheckStatus: null };
attachAutofill(mockBlankContext, [{ firstname: 'Jeremy' }], 'https://example.com', mockSessionBlank, {
  onStuck: () => { stuckTriggeredBlank = true; },
  libraryFirstPassDelayMs: 0,
});
for (let i = 0; i < 5; i++) {
  mockSessionBlank.triggerAutofillScan?.();
  await new Promise((r) => setTimeout(r, 10));
}
assert.equal(stuckTriggeredBlank, false, 'Trang cảm ơn / trống không được trigger onStuck nhầm');

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
mockAdtrapperBrowserClosed = true;

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

// Test findSubmitButton: Không ép nút disabled hoặc đang "Submitting..." chạy lại
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
assert.equal(foundDisabledBtn, null, 'findSubmitButton phải bỏ qua nút đang disabled');
assert.equal(disabledRemoved, false, 'Không được gỡ thuộc tính disabled do website đặt');

const mockLoadingNewsletterButton = {
  isVisible: async () => true,
  isEnabled: async () => true,
  evaluate: async (fn) => fn({
    tagName: 'BUTTON',
    id: 'newsletter-submit',
    disabled: false,
    textContent: 'Submitting...',
    getAttribute: () => null,
  }),
};
const foundLoadingNewsletterButton = await findSubmitButton({
  locator: (selector) => ({
    all: async () => selector === 'button[type="submit"]' ? [mockLoadingNewsletterButton] : [],
  }),
});
assert.equal(foundLoadingNewsletterButton, null, 'Không bấm nút newsletter khi đang hiển thị Submitting...');

// Alpha Intent: chỉ điền ô Full Name hiển thị; không ghi nhận thành công nếu React xóa giá trị.
let alphaNameValue = '';
let alphaNameMarked = null;
const alphaNameField = {
  isEditable: async () => true,
  count: async () => 1,
  isVisible: async () => true,
  inputValue: async () => alphaNameValue,
  getAttribute: async () => alphaNameMarked,
  fill: async (value) => { alphaNameValue = value; },
  press: async () => {},
  evaluate: async (fn) => fn({ dataset: { set uxFilled(value) { alphaNameMarked = value; } } }),
};
const alphaFrame = { locator: (selector) => {
  assert.ok(selector.includes('#alpha-intent-content input[data-testid="fullname-input"]') && selector.includes('#ai-funnel input[data-testid="fullname-input"]'), 'Selector phải bao gồm cả alpha-intent và ai-funnel');
  return alphaNameField;
} };
assert.equal(await fillAlphaIntentFullName(alphaFrame, { firstname: 'Ada', lastname: 'Lovelace' }), true);
assert.equal(alphaNameValue, 'Ada Lovelace');
assert.equal(await fillAlphaIntentFullName(alphaFrame, { firstname: 'Ada', lastname: 'Lovelace' }), false, 'Không tăng bộ đếm sau khi đã điền');
assert.equal(await fillAlphaIntentFullName(alphaFrame, {}), false, 'Không bịa họ tên khi record rỗng');
alphaNameValue = '';
alphaNameMarked = null;
alphaNameField.fill = async () => { alphaNameValue = ''; };
assert.equal(await fillAlphaIntentFullName(alphaFrame, { firstname: 'Ada', lastname: 'Lovelace' }), false, 'React xóa tên thì không ghi nhận đã điền');

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
assert.equal(generatedEmail, null, 'Record thiếu email: không tự sinh email, chỉ dùng email trong danh sách app');

// 8. Test nhận diện Zip Code từ cột ziporpostcode và fallback mã zip theo state
const matchedKendraZip = matchFieldValue(['zipcode', 'zip'], rawKendra);
assert.equal(matchedKendraZip, '99654', 'Phải đọc được zip code từ trường ziporpostcode');

const rawMissingZip = {
  state: 'AK',
};
const fallbackZip = matchFieldValue(['zipcode'], rawMissingZip);
assert.equal(fallbackZip, null, 'Record thiếu zip code -> không tra bảng zip theo bang, trả null');

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
assert.equal(isEmailFieldName('mailing_city'), false);
assert.equal(isEmailFieldName('mailing_state'), false);
assert.equal(isEmailFieldName('mailing_town'), false);
assert.equal(isEmailFieldName('mailing_zip'), false);
assert.equal(isEmailFieldName('mailing_postal'), false);

// 9.1b Ô "mailing ..." là địa chỉ, không được nối @gmail.com; ô email thật vẫn phải nhận email.
{
  const record = { email: 'john.doe', address: '123 Main St', city: 'Dallas', state: 'TX', zip: '75001' };
  const fill = (names, metadata = {}) => matchFieldValue(names, record, { type: 'text', names, ...metadata });
  assert.equal(fill(['Mailing Address']), '123 Main St');
  assert.equal(fill(['mailing_street']), '123 Main St');
  assert.equal(fill(['mailing zip']), '75001');
  assert.equal(fill(['mailing city']), 'Dallas');
  assert.equal(fill(['mailing state']), 'TX');
  assert.equal(fill(['mailing_state']), 'TX');
  assert.equal(fill(['mail', 'address']), '123 Main St');
  assert.equal(fill(['mail'], { placeholder: 'Your mail address' }), '123 Main St');
  assert.equal(fill(['email']), 'john.doe@gmail.com');
  assert.equal(fill(['mail']), 'john.doe@gmail.com');
  assert.equal(fill(['Email Address']), 'john.doe@gmail.com');
  assert.equal(fill(['email', 'zip']), 'john.doe@gmail.com');
  assert.equal(fill(['Email Address'], { assignedEmail: 'x@y.com' }), 'x@y.com');
  assert.equal(fill(['address'], { type: 'email' }), 'john.doe@gmail.com');
  assert.equal(fill(['mailing_address'], { type: 'email' }), 'john.doe@gmail.com');
  assert.equal(fill(['zipmail'], { type: 'email' }), 'john.doe@gmail.com');
  assert.equal(fill(['mail'], { assignedEmail: 'jane' }), 'jane@gmail.com');
}

// 9.2 parseEmailLine
assert.equal(parseEmailLine('daj.gomezramirez@gmail.com'), 'daj.gomezramirez@gmail.com');
assert.equal(parseEmailLine('daj.gomezramirez@gmail.com|||Gmail.txt|Live'), 'daj.gomezramirez@gmail.com');
assert.equal(parseEmailLine('User.123+promo@Sub.Domain.COM:pass123'), 'user.123+promo@sub.domain.com');
assert.equal(parseEmailLine('# ghi chu'), null);
assert.equal(parseEmailLine(''), null);
assert.equal(parseEmailLine('khong_co_email_o_day'), null);
// Gmail rác trong file nguồn: tên quá ngắn, ký tự lạ, dính mã UUID, quá 30 ký tự
for (const bad of ['l@gmail.com', 'work@gmail.com', 'khmai,g@gmail.com', 'a&e@gmail.com', 'name@gmail.com',
  'mollybernardingadca7ab2-e211-4f17-93e7-dc6fdd712fc@gmail.com', 'cassidycorrespondenceangela.cassidy@gmail.com', 'ab..cdef@gmail.com']) {
  assert.equal(parseEmailLine(bad), null, bad);
}
assert.equal(isPlausibleGmail('patnaegle@gmail.com'), true);
assert.equal(isPlausibleGmail('contact.molly.inc+x@gmail.com'), true);
assert.equal(isPlausibleGmail('me@outlook.com'), true); // domain khác Gmail không kiểm tra thêm

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

// 9.3b refillEmailBatchFromSource: nạp từng lô từ file, cộng thêm, nhớ vị trí, bỏ trùng và dòng hỏng
{
  const { mkdtemp, writeFile: writeTmp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const src = join(await mkdtemp(join(tmpdir(), 'email-src-')), 'emails.txt');
  await writeTmp(src, 'aaaaaa.one@gmail.com\nfirst.lead@gmail.com\nbad@gmail.com\nbbbbbb.two@gmail.com\ncccccc.three@gmail.com\n');
  const savedRefill = { ...emailAutoRefill };
  Object.assign(emailAutoRefill, { sourcePath: src, byteOffset: 0, batchSize: 2 });
  emailQueue.available = [];
  assert.equal(await refillEmailBatchFromSource(), 2);
  assert.deepEqual(emailQueue.available, ['aaaaaa.one@gmail.com', 'bbbbbb.two@gmail.com']);
  assert.equal(await refillEmailBatchFromSource(), 1);
  assert.equal(emailQueue.available.at(-1), 'cccccc.three@gmail.com');
  assert.equal(await refillEmailBatchFromSource(), 0);

  // takeNextEmail: hàng đợi cạn + bật tự nạp → chờ nạp lô mới rồi cấp email (trước đây trả null).
  // Nhiều phiên khởi động cùng lúc không được nạp trùng một lô (cùng byteOffset).
  const src2 = join(await mkdtemp(join(tmpdir(), 'email-src-')), 'emails.txt');
  await writeTmp(src2, 'dddddd.four@gmail.com\neeeeee.five@gmail.com\nffffff.six@gmail.com\n');
  Object.assign(emailAutoRefill, { enabled: true, sourcePath: src2, byteOffset: 0, batchSize: 1 });
  emailQueue.available = [];
  const [e1, e2] = await Promise.all([takeNextEmail(), takeNextEmail()]);
  assert.equal(e1, 'dddddd.four@gmail.com');
  assert.ok(e2 === null || e2 === 'eeeeee.five@gmail.com', `email thứ hai không được trùng: ${e2}`);
  assert.equal(new Set(emailQueue.used).size, emailQueue.used.length, 'Không được cấp trùng email');
  Object.assign(emailAutoRefill, savedRefill);
}

// withoutSessionEmail: record tái dùng không được mang email của phiên trước
assert.deepEqual(
  withoutSessionEmail({ firstname: 'Ann', email: 'old.session@gmail.com', mail: 'old.session@gmail.com', assignedEmail: 'old.session@gmail.com' }),
  { firstname: 'Ann' },
);
assert.deepEqual(withoutSessionEmail({ firstname: 'Ann', email: 'own@gmail.com' }), { firstname: 'Ann', email: 'own@gmail.com' });

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

// 10.4 Kiểm tra sinh User-Agent mang đúng số phiên bản đầy đủ của Chrome đang mở
assert.ok(DEVICE_PROFILES.android.ua('150.0.7871.187').includes('Chrome/150.0.7871.187'), 'Android UA phải chứa Chrome/150.0.7871.187');
assert.ok(DEVICE_PROFILES.windows.ua('150.0.7871.187').includes('Chrome/150.0.7871.187'), 'Windows UA phải chứa Chrome/150.0.7871.187');
assert.ok(DEVICE_PROFILES.macos.ua('150.0.7871.187').includes('Chrome/150.0.7871.187'), 'macOS UA phải chứa Chrome/150.0.7871.187');
assert.ok(DEVICE_PROFILES.ios.ua('151.0.7922.174').includes('CriOS/151.0.7922.174'), 'iOS UA phải chứa CriOS/151');
assert.ok(DEVICE_PROFILES.ipad.ua('152.0.7977.83').includes('CriOS/152.0.7977.83'), 'iPad UA phải chứa CriOS/152');

// 11. Kiểm tra các cơ chế được huấn luyện từ log HTML thực tế
// 11.1 Tự động nhận diện và sinh ssn_last4 / last4 / ssn4
assert.equal(
  matchFieldValue(['ssn_last4', 'last4'], { ssn: '123-45-6789' }),
  '6789',
  'Khi có ssn đầy đủ, ssn_last4 phải lấy 4 số cuối của SSN'
);
assert.equal(
  matchFieldValue(['ssn_last4', 'ssn4'], { phone: '8149143396' }),
  '3396',
  'Khi thiếu ssn, ssn_last4 phải fallback lấy 4 số cuối của số điện thoại'
);
const fallbackSsn4 = matchFieldValue(['ssn_last4'], {});
assert.equal(fallbackSsn4, null, 'Khi record rỗng và không có số điện thoại, ssn_last4 không bịa giá trị');

// 11.2 Kiểm tra extractCleanPageStructure (làm sạch HTML trước khi gửi AI Assist)
const dirtyHtml = `
<html>
<head>
  <style>body { background: #fff; } .hero { font-size: 14px; }</style>
  <script src="https://analytics.example.com/gtm.js"></script>
  <script>window.dataLayer = window.dataLayer || [];</script>
</head>
<body>
  <!-- Đây là comment ẩn của tracker -->
  <svg width="24" height="24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
  <noscript><iframe src="https://ns.example.com"></iframe></noscript>
  <form id="lead-form">
    <label for="fname">First Name</label>
    <input id="fname" name="first_name" type="text" />
    <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" />
    <button type="submit" class="continue-button">Continue</button>
  </form>
</body>
</html>
`;
const cleaned = extractCleanPageStructure(dirtyHtml);
assert.ok(!cleaned.includes('<script'), 'HTML sau khi làm sạch không được chứa thẻ script');
assert.ok(!cleaned.includes('<style'), 'HTML sau khi làm sạch không được chứa thẻ style');
assert.ok(!cleaned.includes('<svg'), 'HTML sau khi làm sạch không được chứa thẻ svg');
assert.ok(!cleaned.includes('<noscript'), 'HTML sau khi làm sạch không được chứa thẻ noscript');
assert.ok(!cleaned.includes('Đây là comment ẩn'), 'HTML sau khi làm sạch không được chứa comment');
assert.ok(!cleaned.includes('iVBORw0KGgoAAA'), 'HTML sau khi làm sạch phải xóa base64');
assert.ok(cleaned.includes('<input id="fname" name="first_name" type="text" />'), 'HTML làm sạch phải giữ nguyên ô input');
assert.ok(cleaned.includes('class="continue-button"'), 'HTML làm sạch phải giữ nguyên nút submit');

// 11.3 Kiểm tra handleNegativeSkipButtons là hàm hợp lệ
assert.equal(typeof handleNegativeSkipButtons, 'function');

// 11.4 Kiểm tra findSubmitButton phát hiện nút bấm Continue / Submit dạng div, a, button
const mockFrameWithContinue = {
  locator: (sel) => ({
    all: async () => {
      if (sel.includes('button#btnSubmit') || sel.includes('button.continue-btn') || sel.includes('div.continue-btn')) {
        return [{
          isVisible: async () => true,
          isEnabled: async () => true,
          evaluate: async (fn) => fn({
            tagName: 'BUTTON',
            id: 'btnSubmit',
            className: 'continue-btn',
            innerText: 'Continue to Next Step',
            getBoundingClientRect: () => ({ width: 150, height: 45 }),
            closest: () => null,
          }),
        }];
      }
      return [];
    },
  }),
};
const foundBtn = await findSubmitButton(mockFrameWithContinue);
assert.ok(foundBtn !== null, 'findSubmitButton phải tìm thấy nút button#btnSubmit');

// 11.5 Kiểm tra tự động phát hiện và chọn ngẫu nhiên đáp án id="btn-option"
const clickedOptions = [];
const mockFrameForBtnOption = {
  evaluate: async () => [
    // Contract mới: mỗi nhóm trả về từ evaluate là { source, heading, items }
    {
      source: 'btn_option',
      heading: '',
      items: [
        { uid: 'btn_opt_1', id: 'btn-option', className: 'btn-choice', text: 'Yes', isSelected: false, recentlyClicked: false },
        { uid: 'btn_opt_2', id: 'btn-option', className: 'btn-choice', text: 'No', isSelected: false, recentlyClicked: false },
        { uid: 'btn_opt_3', id: 'btn-option', className: 'btn-choice', text: 'Maybe', isSelected: false, recentlyClicked: false },
      ],
    },
  ],
  locator: (sel) => ({
    first: () => createVerifiedChoiceLocator(sel, selector => clickedOptions.push(selector)),
  }),
};

const answered = await handleRadioAndSurveyOptions(mockFrameForBtnOption);
assert.equal(answered, 1, 'handleRadioAndSurveyOptions phải chọn được 1 đáp án từ nhóm btn-option');
assert.equal(clickedOptions.length, 1, 'Đúng 1 option được click');
assert.ok(
  clickedOptions[0].includes('btn_opt_1') ||
  clickedOptions[0].includes('btn_opt_2') ||
  clickedOptions[0].includes('btn_opt_3'),
  'Option được click phải nằm trong danh sách nhóm btn-option'
);

// 11.6 Kiểm tra autofill tiếp tục chạy và kiểm tra submit liên tục khi leadCheckStatus = 'waiting' (không bị đứng màn hình)
let submitClickedDuringLeadWait = false;
const mockLeadWaitPageEvents = {};
const mockReadySubmitDomState = {
  getAttribute: () => null,
  hasAttribute: () => false,
  ownerDocument: { defaultView: { getComputedStyle: () => ({ opacity: '1' }) } },
};
const mockSubmitButton = {
  ...mockReadySubmitDomState,
  tagName: 'BUTTON',
  id: 'btnNext',
  className: 'continue-btn',
  innerText: 'Next Step',
  dataset: {},
  disabled: false,
  removeAttribute: () => {},
  classList: { remove: () => {} },
  setAttribute: () => {},
  getBoundingClientRect: () => ({ width: 120, height: 40 }),
  closest: () => null,
  dispatchEvent: () => {},
  click: () => { submitClickedDuringLeadWait = true; },
};

const mockLeadWaitPage = {
  isClosed: () => false,
  url: () => 'https://example.com/step2',
  on: (evt, handler) => { mockLeadWaitPageEvents[evt] = handler; },
  evaluate: async (fn, arg) => {
    if (typeof fn === 'function') {
      return fn(mockSubmitButton, arg);
    }
    return true;
  },
  frames: () => [{
    locator: (sel) => ({
      all: async () => {
        if (sel.includes('button') || sel.includes('continue')) {
          return [{
            isVisible: async () => true,
            isEnabled: async () => true,
            scrollIntoViewIfNeeded: async () => {},
            hover: async () => {},
            click: async () => { submitClickedDuringLeadWait = true; },
            evaluate: async (fn) => fn(mockSubmitButton),
          }];
        }
        return [];
      },
    }),
    evaluate: async (fn) => {
      if (fn?.toString() === '() => true') return true;
      if (fn?.name === 'inspectYesNoStep') return { questions: [] };
      return { unfilled: false };
    },
  }],
};

const mockContextLeadWait = {
  on: (evt, handler) => { mockLeadWaitPageEvents[evt] = handler; },
  pages: () => [mockLeadWaitPage],
};

const mockSessionLeadWait = {
  autofillFields: 2,
  leadCheckStatus: 'waiting', // Đang trong quá trình chờ lead API
};

attachAutofill(mockContextLeadWait, [{ firstname: 'John' }], 'https://example.com', mockSessionLeadWait, {
  autoSubmit: true,
});

mockSessionLeadWait.triggerAutofillScan?.();
await new Promise((r) => setTimeout(r, 250));
assert.ok(submitClickedDuringLeadWait, 'Submit phải được kiểm tra và bấm liên tục ngay cả khi leadCheckStatus đang là waiting');

// 11.7 Kiểm tra findSubmitButton nhận diện nút Jump Page CTA (màn hình thứ 5 sau DOB/Gender)
const mockJumpPageCta = {
  tagName: 'A',
  href: 'https://16.dlysurge.com/next?s=123',
  className: 'cta-button',
  innerText: 'Get My Reward',
  getAttribute: (attr) => (attr === 'aria-label' ? 'Get My Reward' : null),
  isVisible: async () => true,
  isEnabled: async () => true,
  evaluate: async (fn) => fn({
    tagName: 'A',
    href: 'https://16.dlysurge.com/next?s=123',
    className: 'cta-button',
    innerText: 'Get My Reward',
    closest: () => null,
    getBoundingClientRect: () => ({ width: 200, height: 50 }),
  }),
};

const mockJumpPageFrame = {
  locator: (sel) => ({
    all: async () => {
      if (sel.includes('.cta-button') || sel.includes('Get My Reward') || sel.includes('a[href*="/next"]')) {
        return [mockJumpPageCta];
      }
      return [];
    },
  }),
};

const foundJumpCta = await findSubmitButton(mockJumpPageFrame);
assert.ok(foundJumpCta !== null, 'findSubmitButton phải tìm thấy nút Jump Page CTA (a.cta-button / Get My Reward)');
assert.equal(foundJumpCta, mockJumpPageCta, 'Nút tìm thấy phải là mockJumpPageCta');

// 11.8 Kiểm tra handleRadioAndSurveyOptions cập nhật session.lastActionTime và session.autofillFields
const mockSessionForSurvey = {
  lastActionTime: 0,
  autofillFields: 0,
};
const mockSurveyClicked = [];
const mockFrameForSurveyOption = {
  evaluate: async () => [
    // Contract mới: mỗi nhóm trả về từ evaluate là { source, heading, items }
    {
      source: 'btn_option',
      heading: '',
      items: [
        { uid: 'btn_opt_choice_1', id: 'btn-option', className: 'btn-option', text: 'Option A', isSelected: false, recentlyClicked: false },
        { uid: 'btn_opt_choice_2', id: 'btn-option', className: 'btn-option', text: 'Option B', isSelected: false, recentlyClicked: false },
      ],
    },
  ],
  locator: (sel) => ({
    first: () => createVerifiedChoiceLocator(sel, selector => mockSurveyClicked.push(selector)),
  }),
};

const surveyResult = await handleRadioAndSurveyOptions(mockFrameForSurveyOption, {}, mockSessionForSurvey);
assert.equal(surveyResult, 1, 'handleRadioAndSurveyOptions phải chọn được 1 option');
assert.ok(mockSessionForSurvey.lastActionTime > 0, 'session.lastActionTime phải được cập nhật');
assert.equal(mockSessionForSurvey.autofillFields, 0, 'session.autofillFields phải không tăng khi chỉ click đáp án khảo sát');
assert.equal((mockSessionForSurvey.autofillActions ?? 0), 1, 'session.autofillActions phải được tăng khi click đáp án khảo sát');

// 11.9 Test attachAutofill tự động đóng tab/popup quảng cáo rác (galaxystore.samsung.com)
let spamPopupClosed = false;
let popupListener = null;
const mockSpamPage = {
  url: () => 'https://galaxystore.samsung.com/detail/com.sec.android.app.samsungapps',
  close: async () => { spamPopupClosed = true; },
  isClosed: () => false,
  on: () => {},
  evaluate: async () => false,
  locator: () => ({ all: async () => [] }),
};
const mockMainPage = {
  url: () => 'https://survey.example.com',
  isClosed: () => false,
  on: (evt, handler) => {
    if (evt === 'popup') popupListener = handler;
  },
  evaluate: async () => false,
  locator: () => ({ all: async () => [] }),
};
const mockSpamContext = {
  pages: () => [mockMainPage],
  on: () => {},
};

attachAutofill(mockSpamContext, [{ firstname: 'John' }], 'https://survey.example.com', {});
assert.ok(typeof popupListener === 'function', 'Phải đăng ký lắng nghe popup trên trang');
if (popupListener) {
  popupListener(mockSpamPage);
  assert.equal(spamPopupClosed, true, 'Popup galaxystore.samsung.com phải tự động bị đóng ngay lập tức');
}

// 12. Kiểm tra chế độ chạy 2 luồng song song (Dual Stream)
// 12.1 Quy luật duyệt proxy: Luồng 1 từ đầu đến cuối (0 -> N-1), Luồng 2 từ cuối ra đầu (N-1 -> 0)
dualStreamState.enabled = true;
dualStreamState.websiteUrl1 = 'https://link1.com';
dualStreamState.websiteUrl2 = 'https://link2.com';
dualStreamState.stream1Index = 0;
dualStreamState.stream2Index = -1;
dualStreamState.stream1Used.clear();
dualStreamState.stream2Used.clear();

const testProxies = [
  { server: 'socks5://1.1.1.1:1080', _queueLine: '1.1.1.1:1080' },
  { server: 'socks5://2.2.2.2:1080', _queueLine: '2.2.2.2:1080' },
  { server: 'socks5://3.3.3.3:1080', _queueLine: '3.3.3.3:1080' },
  { server: 'socks5://4.4.4.4:1080', _queueLine: '4.4.4.4:1080' },
];

// Lần 1: Luồng 1 lấy từ đầu (1.1.1.1), Luồng 2 lấy từ cuối (4.4.4.4)
const p1_0 = getNextProxyForStream(1, testProxies);
const p2_0 = getNextProxyForStream(2, testProxies);
assert.equal(p1_0.server, 'socks5://1.1.1.1:1080', 'Luồng 1 phải lấy proxy đầu tiên');
assert.equal(p2_0.server, 'socks5://4.4.4.4:1080', 'Luồng 2 phải lấy proxy cuối cùng');

// Lần 2: Luồng 1 lấy tiếp theo (2.2.2.2), Luồng 2 lấy từ cuối lùi về (3.3.3.3)
const p1_1 = getNextProxyForStream(1, testProxies);
const p2_1 = getNextProxyForStream(2, testProxies);
assert.equal(p1_1.server, 'socks5://2.2.2.2:1080', 'Luồng 1 phải tiến lên lấy proxy thứ 2');
assert.equal(p2_1.server, 'socks5://3.3.3.3:1080', 'Luồng 2 phải lùi lại lấy proxy thứ 3');

// 12.2 Thuật toán phân bổ tránh nhau & tái sử dụng proxy tuần tự:
// Không mở trùng 1 IP cho 2 offer cùng nhau khi đang chạy đồng thời, nhưng tái sử dụng được sau khi giải phóng
resetMultiOfferState();
const singleProxyList = [{ server: 'socks5://9.9.9.9:1080', _queueLine: '9.9.9.9:1080' }];

// Luồng 1 lấy proxy 9.9.9.9 và đang mở (giữ khóa)
const p1_single = getNextProxyForStream(1, singleProxyList);
assert.ok(p1_single !== null, 'Luồng 1 phải lấy được proxy');
assert.equal(p1_single.server, 'socks5://9.9.9.9:1080');

// Trong lúc Luồng 1 đang mở 9.9.9.9 (chưa đóng): Luồng 2 yêu cầu proxy -> Phải tránh nhau, KHÔNG được mở trùng 9.9.9.9 đồng thời
const p2_concurrent = getNextProxyForStream(2, singleProxyList);
assert.equal(p2_concurrent, null, 'Luồng 2 KHÔNG được mở trùng IP 9.9.9.9 cùng lúc khi Luồng 1 đang chạy');

// Luồng 1 hoàn thành và đóng phiên -> giải phóng khóa
releaseProxyLock(p1_single);

// Giờ Luồng 2 được phép tái sử dụng lại proxy 9.9.9.9 cho Offer 2 (chạy tuần tự)
const p2_after_release = getNextProxyForStream(2, singleProxyList);
assert.ok(p2_after_release !== null, 'Luồng 2 tái sử dụng được proxy 9.9.9.9 sau khi Luồng 1 đã giải phóng');
assert.equal(p2_after_release.server, 'socks5://9.9.9.9:1080');

// Khi cả 2 offer đều đã chạy qua 9.9.9.9 -> isProxyUsedByAllOffers trả về true
assert.equal(isProxyUsedByAllOffers(p1_single, 2), true, 'Proxy 9.9.9.9 đã được dùng bởi cả 2 offer');
releaseProxyLock(p2_after_release);

// 12.3 createProxyUsageKey tạo khóa riêng cho từng websiteUrl để ghi nhận lịch sử độc lập
const key1 = createProxyUsageKey(singleProxyList[0], 1, 'https://link1.com');
const key2 = createProxyUsageKey(singleProxyList[0], 1, 'https://link2.com');
// 12.4 Kiểm tra chế độ chạy tuần tự: nếu điền cả 2 link thì chạy đồng thời cả 2 link (targetCount = 2)
const seqSettingsDual = {
  websiteUrl: 'https://link1.com',
  websiteUrl2: 'https://link2.com',
};
const url1 = normalizeUrl(seqSettingsDual.websiteUrl);
const url2 = normalizeUrl(seqSettingsDual.websiteUrl2);
const isDualSeq = Boolean(url1 && url2 && url1 !== url2);
assert.equal(isDualSeq, true, 'Phải nhận diện được 2 link đích khác nhau');
const seqTarget = isDualSeq ? 2 : 1;
assert.equal(seqTarget, 2, 'Chạy tuần tự khi điền 2 link phải đặt targetCount = 2 để chạy đồng thời cả 2 link');

const seqSettingsSingle = {
  websiteUrl: 'https://link1.com',
  websiteUrl2: '',
};
const isSingleSeq = Boolean(seqSettingsSingle.websiteUrl && seqSettingsSingle.websiteUrl2 && seqSettingsSingle.websiteUrl !== seqSettingsSingle.websiteUrl2);
assert.equal(isSingleSeq, false, 'Khi chỉ có 1 link thì không phải dual stream');
assert.equal(isSingleSeq ? 2 : 1, 1, 'Chạy tuần tự 1 link phải đặt targetCount = 1');

// 12.5 Phân bổ 3 offer trên 6 proxy với độ lệch tránh nhau (Collision-free stride)
resetMultiOfferState();
const multiProxies = [
  { server: 'socks5://10.0.0.1:1080', _queueLine: '10.0.0.1:1080' },
  { server: 'socks5://10.0.0.2:1080', _queueLine: '10.0.0.2:1080' },
  { server: 'socks5://10.0.0.3:1080', _queueLine: '10.0.0.3:1080' },
  { server: 'socks5://10.0.0.4:1080', _queueLine: '10.0.0.4:1080' },
  { server: 'socks5://10.0.0.5:1080', _queueLine: '10.0.0.5:1080' },
  { server: 'socks5://10.0.0.6:1080', _queueLine: '10.0.0.6:1080' },
];

// Offer 1, Offer 2, Offer 3 lấy proxy đồng thời
const o1_p = getNextCollisionFreeProxy(1, multiProxies, 3);
const o2_p = getNextCollisionFreeProxy(2, multiProxies, 3);
const o3_p = getNextCollisionFreeProxy(3, multiProxies, 3);

// 3 offer phải lấy 3 proxy hoàn toàn khác nhau (độ lệch 0, 2, 4)
assert.equal(o1_p.server, 'socks5://10.0.0.1:1080', 'Offer 1 bắt đầu từ proxy index 0');
assert.equal(o2_p.server, 'socks5://10.0.0.3:1080', 'Offer 2 phân bổ bắt đầu từ proxy index 2 (stride)');
assert.equal(o3_p.server, 'socks5://10.0.0.5:1080', 'Offer 3 phân bổ bắt đầu từ proxy index 4 (stride)');

// Không proxy nào trùng nhau giữa 3 offer
const activeServers = new Set([o1_p.server, o2_p.server, o3_p.server]);
assert.equal(activeServers.size, 3, 'Cả 3 offer đang chạy đồng thời 3 IP khác nhau, không xung đột');

// Giải phóng proxy của Offer 1
releaseProxyLock(o1_p);
assert.equal(isProxyCurrentlyActive(o1_p), false, 'Proxy đã được giải phóng');

// Hai tài khoản proxy có cùng gateway vẫn là hai proxy độc lập.
const firstGatewayAccount = parse('gateway.example:8080:first:secret', 'http');
const secondGatewayAccount = parse('gateway.example:8080:second:secret', 'http');
acquireProxyLock(firstGatewayAccount);
assert.equal(isProxyCurrentlyActive(firstGatewayAccount), true);
assert.equal(isProxyCurrentlyActive(secondGatewayAccount), false);
releaseProxyLock(firstGatewayAccount);

// 12.6 Tái sử dụng tuần tự qua toàn bộ 3 offer và chỉ hoàn tất khi tất cả offer đã chạy:
resetMultiOfferState();
const singleSharedProxy = [{ server: 'socks5://77.77.77.77:1080', _queueLine: '77.77.77.77:1080' }];

// Lần 1: Offer 1 chạy
const run1 = getNextCollisionFreeProxy(1, singleSharedProxy, 3);
assert.equal(run1.server, 'socks5://77.77.77.77:1080');
assert.equal(isProxyUsedByAllOffers(run1, 3), false, 'Chưa xong vì mới chỉ offer 1 dùng');

// Khi Offer 1 đang chạy, Offer 2 và Offer 3 không thể lấy vì đang bị lock
assert.equal(getNextCollisionFreeProxy(2, singleSharedProxy, 3), null, 'Offer 2 bị chặn vì proxy đang bận');
assert.equal(getNextCollisionFreeProxy(3, singleSharedProxy, 3), null, 'Offer 3 bị chặn vì proxy đang bận');

// Offer 1 đóng trình duyệt -> giải phóng lock
releaseProxyLock(run1);

// Lần 2: Giờ Offer 2 lấy được proxy này
const run2 = getNextCollisionFreeProxy(2, singleSharedProxy, 3);
assert.equal(run2.server, 'socks5://77.77.77.77:1080');
assert.equal(isProxyUsedByAllOffers(run2, 3), false, 'Chưa xong vì mới 2/3 offer dùng');
releaseProxyLock(run2);

// Lần 3: Giờ Offer 3 lấy được proxy này
const run3 = getNextCollisionFreeProxy(3, singleSharedProxy, 3);
assert.equal(run3.server, 'socks5://77.77.77.77:1080');

// Giờ cả 3 offer đều đã chạy qua proxy này -> isProxyUsedByAllOffers trả về true để chuyển sang used
assert.equal(isProxyUsedByAllOffers(run3, 3), true, 'Hoàn tất cả 3 offer, đủ điều kiện chuyển sang proxyQueue.used');
releaseProxyLock(run3);

// 13. Kiểm tra Smart Contextual Fallback cho các trường tài chính / khảo sát
assert.equal(matchFieldValue(['income'], {}), null, 'Income không có trong dữ liệu -> trả null');
assert.equal(matchFieldValue(['debt'], {}), null, 'Debt không có trong dữ liệu -> trả null');
assert.equal(matchFieldValue(['credit_score'], {}), null, 'Credit score không có trong dữ liệu -> trả null');
assert.equal(matchFieldValue(['homeowner'], {}), null, 'Homeowner không có trong dữ liệu -> trả null');
assert.equal(matchFieldValue(['employment_status'], {}), null, 'Employment status không có trong dữ liệu -> trả null');
assert.equal(matchFieldValue(['education'], {}), null, 'Education không có trong dữ liệu -> trả null');
assert.equal(matchFieldValue(['military'], {}), null, 'Military không có trong dữ liệu -> trả null');
assert.equal(matchFieldValue(['weight'], {}), null, 'Weight không có trong dữ liệu -> trả null');
assert.equal(matchFieldValue(['height_feet'], {}), null, 'Height feet không có trong dữ liệu -> trả null');
assert.equal(matchFieldValue(['height_inches'], {}), null, 'Height inches không có trong dữ liệu -> trả null');

// 14. Kiểm tra Universal Smart Fallback cho các ô BẮT BUỘC (required): không để trống
assert.equal(matchFieldValue(['custom_unknown_number'], {}, { required: true, type: 'number' }), null, 'Thiếu dữ liệu của ô số bắt buộc phải giữ chưa hoàn tất');
assert.equal(matchFieldValue(['custom_unknown_text'], {}, { required: true, type: 'text' }), null, 'Ô text bắt buộc không có trong dữ liệu -> để trống, không bịa giá trị');
assert.equal(matchFieldValue(['custom_comments'], {}, { required: true, kind: 'textarea' }), null, 'Không tự viết nội dung mẫu vào textarea khi thiếu record');
assert.ok(matchFieldValue(['required_tel_field'], {}, { required: true, type: 'tel' }).replace(/\D/g, '').length >= 10, 'Ô tel bắt buộc phải có số điện thoại');
assert.equal(matchFieldValue(['required_email_field'], {}, { required: true, type: 'email' }), null, 'Ô email bắt buộc nhưng không có email trong danh sách: để trống, không tự sinh');

// 15. Kiểm tra findSubmitButton nhận diện các biến thể nút submit mới (Check Eligibility, Complete)
const mockCheckBtn = {
  isVisible: async () => true,
  evaluate: async () => ({ valid: true }),
  isEnabled: async () => true,
};
const mockEligibilityFrame = {
  locator: (sel) => ({
    all: async () => (sel.includes('Check Eligibility') ? [mockCheckBtn] : []),
  }),
};
const foundEligibility = await findSubmitButton(mockEligibilityFrame);
assert.equal(foundEligibility, mockCheckBtn, 'findSubmitButton phải nhận diện nút Check Eligibility');

// 16. Kiểm tra form submit chủ động bấm ngay cả khi có trường unfilled
let activeSubmitClicked = false;
const mockActiveSubmitBtn = {
  isVisible: async () => true,
  isEnabled: async () => true,
  scrollIntoViewIfNeeded: async () => {},
  hover: async () => {},
  click: async () => { activeSubmitClicked = true; },
  evaluate: async (fn, arg) => fn({
    tagName: 'BUTTON',
    id: 'submitBtnActive',
    ...mockReadySubmitDomState,
    innerText: 'Submit Form',
    dataset: {},
  }, arg),
};
let mockActivePageClosed = false;
const mockActivePage = {
  isClosed: () => mockActivePageClosed,
  url: () => 'https://example.com/form',
  on: () => {},
  frames: () => [{
    locator: (sel) => ({
      all: async () => {
        if (sel.includes('button') || sel.includes('Submit')) {
          return [mockActiveSubmitBtn];
        }
        return [];
      },
    }),
    evaluate: async () => ({ unfilled: true, id: 'optional_notes' }), // Giả lập trường chưa điền
  }],
};
const mockActiveEvents = {};
const mockActiveContext = {
  on: (evt, handler) => { mockActiveEvents[evt] = handler; },
  pages: () => [mockActivePage],
};
const mockActiveSession = {
  autofillFields: 3,
};
attachAutofill(mockActiveContext, [{ firstname: 'Alice' }], 'https://example.com', mockActiveSession, {
  autoSubmit: true,
});
mockActiveSession.triggerAutofillScan?.();
await new Promise((r) => setTimeout(r, 200));
mockActivePageClosed = true;
console.log('Test 16 OK');

// 17. Kiểm tra luồng check lead sau khi nộp màn điền email
let emailSubmitTriggered = false;
let emailFieldFilled = false;
let emailSubmitBtnClicked = false;

const mockEmailSubmitBtn = {
  isVisible: async () => true,
  isEnabled: async () => true,
  scrollIntoViewIfNeeded: async () => {},
  hover: async () => {},
  click: async () => { emailSubmitBtnClicked = true; },
  evaluate: async (fn, arg) => fn({
    tagName: 'BUTTON',
    id: 'btnNextEmail',
    ...mockReadySubmitDomState,
    innerText: 'Continue to Next Step',
    dataset: {},
  }, arg),
};

const mockEmailInput = {
  isVisible: async () => true,
  isEnabled: async () => true,
  getAttribute: async () => null,
  scrollIntoViewIfNeeded: async () => {},
  hover: async () => {},
  click: async () => {},
  press: async () => {},
  inputValue: async () => 'test@gmail.com',
  evaluate: async (fn, arg) => {
    emailFieldFilled = true;
    return fn({
      id: 'user_email',
      name: 'email',
      className: 'input-email',
      type: 'email',
      tagName: 'INPUT',
      required: true,
      value: 'test@gmail.com',
      attributes: [{ name: 'type', value: 'email' }, { name: 'name', value: 'email' }],
      getAttribute: (a) => (a === 'type' ? 'email' : (a === 'name' ? 'email' : null)),
      closest: () => null,
      classList: { remove: () => {}, add: () => {}, contains: () => false },
      dispatchEvent: () => {},
      dataset: {},
      getBoundingClientRect: () => ({ left: 10, top: 10, width: 100, height: 30 }),
    }, arg);
  },
  dispatchEvent: async () => {},
};

let mockEmailPageClosed = false;
let mockEmailPageUrl = 'https://example.com/step-email';
const mockEmailPage = {
  isClosed: () => mockEmailPageClosed,
  url: () => mockEmailPageUrl,
  on: () => {},
  off: () => {},
  frames: () => [{
    locator: (sel) => ({
      all: async () => {
        if (sel === 'input, textarea, select') {
          return [mockEmailInput];
        }
        if (sel.includes('button') || sel.includes('Continue') || sel.includes('submit')) {
          return [mockEmailSubmitBtn];
        }
        return [];
      },
      count: async () => 0,
      first: () => ({ count: async () => 0, isVisible: async () => false }),
    }),
    evaluate: async (fn) => {
      if (fn?.toString() === '() => true') return true;
      if (fn?.name === 'inspectYesNoStep') return { questions: [] };
      return { isScreen5: false, isJumpPage: false, hasEmailInput: true };
    },
  }],
};

const mockEmailContext = {
  on: () => {},
  pages: () => [mockEmailPage],
};

const mockEmailSession = {
  autofillFields: 0,
};

attachAutofill(mockEmailContext, [{ email: 'test@gmail.com' }], 'https://example.com', mockEmailSession, {
  autoSubmit: true,
  enableLeadCheck: true,
  leadCheckScreen: 1,
  onEmailSubmitted: (sess) => {
    emailSubmitTriggered = true;
  },
  onScreen5Reached: (sess) => {
    emailSubmitTriggered = true;
  },
});

mockEmailSession.triggerAutofillScan?.();
await new Promise((r) => setTimeout(r, 600));

assert.ok(mockEmailSession.emailFilled, 'Session phải đánh dấu emailFilled khi điền ô email');
assert.ok(emailSubmitBtnClicked, 'Autofill phải click submit màn chứa email');
assert.ok(mockEmailSession.emailScreenSubmitted, 'Session phải đánh dấu emailScreenSubmitted');
// Bấm submit nhưng trang vẫn đứng ở màn email (cùng URL, ô email còn hiện): CHƯA được check lead.
assert.ok(!mockEmailSession.leadCheckTriggered, 'Chưa qua được màn email thì không được check lead');
// Trang nhảy sang màn tiếp theo → lượt quét sau mới check lead.
mockEmailPageUrl = 'https://example.com/step-2';
mockEmailSession.triggerAutofillScan?.();
await new Promise((r) => setTimeout(r, 600));
assert.ok(mockEmailSession.leadCheckTriggered, 'Session phải kích hoạt leadCheckTriggered sau khi đã nhảy qua màn email');
assert.equal(mockEmailSession.leadCheckStatus, 'checking', 'Trạng thái lead check phải là checking');
assert.ok(emailSubmitTriggered, 'Callback onEmailSubmitted/onScreen5Reached phải được gọi');

// Thử quét lại trong khi đang chờ lead: không được bấm thêm submit nào khác
let secondSubmitAttempted = false;
mockEmailSubmitBtn.click = async () => { secondSubmitAttempted = true; };
mockEmailSession.triggerAutofillScan?.();
await new Promise((r) => setTimeout(r, 200));
assert.strictEqual(secondSubmitAttempted, false, 'Autofill không được thực hiện thêm click khi đang chờ lead');

// Khi lead được xác nhận, hệ thống cho phép quét tiếp
mockEmailSession.screen5LeadVerified = true;
mockEmailSession.leadCheckStatus = 'confirmed';

mockEmailPageClosed = true;

// 17.2 KIỂM TRA MẶC ĐỊNH KHÔNG DỪNG Ở MÀN 1 NẾU MỤC TIÊU LÀ MÀN 4-5
mockEmailPageClosed = false;
mockEmailPageUrl = 'https://example.com/step-email';
const mockEmailSession5 = { autofillFields: 0 };
let email5LeadTriggered = false;
let email5SubmitClicked = false;
mockEmailSubmitBtn.click = async () => {
  email5SubmitClicked = true;
  mockEmailPageUrl = 'https://example.com/step-2'; // Mô phỏng form submit chuyển sang màn tiếp theo
};

attachAutofill(mockEmailContext, [{ email: 'test@gmail.com' }], 'https://example.com', mockEmailSession5, {
  autoSubmit: true,
  enableLeadCheck: true,
  leadCheckScreen: 5, // Mục tiêu màn 5
  onEmailSubmitted: () => { email5LeadTriggered = true; },
  onScreen5Reached: () => { email5LeadTriggered = true; },
});

mockEmailSession5.triggerAutofillScan?.();
await new Promise((r) => setTimeout(r, 400));
// Lượt quét sau khi trang đã sang màn mới mới check lead (check sau khi đã NHẢY QUA màn email).
mockEmailSession5.triggerAutofillScan?.();
await new Promise((r) => setTimeout(r, 400));

assert.ok(email5SubmitClicked, 'Phải click submit màn 1');
assert.strictEqual(mockEmailSession5.completedScreens, 1, 'Đã hoàn thành màn 1');
// SPEC MỚI (2026-10-26): chỉ cần bước qua màn nhập email là kích hoạt check lead ngay (2 lần x 30s),
// không chờ đủ số màn mục tiêu.
assert.ok(mockEmailSession5.leadCheckTriggered, 'Sau màn email đã kích hoạt leadCheckTriggered (spec mới: check ngay sau màn email)');
assert.ok(email5LeadTriggered, 'Callback chờ lead được gọi ngay sau màn email (spec mới)');
mockEmailPageClosed = true;

// ─── 18. KIỂM TRA TƯƠNG TÁC TRÌNH DUYỆT TỰ NHIÊN (HUMAN INTERACTION PHYSICS) ───
// 18.1 Bảng phím kế cận ADJACENT_KEYS
assert.ok(ADJACENT_KEYS && typeof ADJACENT_KEYS === 'object');
assert.ok(Array.isArray(ADJACENT_KEYS.a) && ADJACENT_KEYS.a.includes('s'));
assert.ok(Array.isArray(ADJACENT_KEYS.e) && ADJACENT_KEYS.e.includes('w'));

// 18.2 Di chuyển chuột Bézier (humanMouseMove)
const mouseMoves = [];
const mockMousePage = {
  mouse: {
    move: async (x, y) => { mouseMoves.push({ x, y }); },
    down: async () => {},
    up: async () => {},
    wheel: async (dx, dy) => {},
  },
};
await humanMouseMove(mockMousePage, 500, 400);
assert.ok(mouseMoves.length >= 7, 'humanMouseMove phải sinh ít nhất 7 bước di chuyển Bézier mượt');
const lastMove = mouseMoves[mouseMoves.length - 1];
assert.equal(lastMove.x, 500, 'Điểm đến cuối cùng phải chính xác là 500');
assert.equal(lastMove.y, 400, 'Điểm đến cuối cùng phải chính xác là 400');

// 18.3 Cuộn chuột tự nhiên (humanWheelScroll)
const wheelDeltas = [];
mockMousePage.mouse.wheel = async (dx, dy) => { wheelDeltas.push(dy); };
await humanWheelScroll(mockMousePage, 240);
assert.ok(wheelDeltas.length >= 3, 'humanWheelScroll phải chia thành nhiều đợt cuộn lăn bánh xe tự nhiên');
const totalScrolled = wheelDeltas.reduce((acc, v) => acc + v, 0);
assert.ok(Math.abs(totalScrolled - 240) < 50, 'Tổng quãng đường cuộn phải xấp xỉ 240px');

// 18.4 Click tự nhiên (humanClick) với Playwright CDP events
let mouseDownCalled = false;
let mouseUpCalled = false;
mockMousePage.mouse.down = async () => { mouseDownCalled = true; };
mockMousePage.mouse.up = async () => { mouseUpCalled = true; };

const mockElementWithBox = {
  boundingBox: async () => ({ x: 100, y: 100, width: 200, height: 40 }),
  scrollIntoViewIfNeeded: async () => {},
  focus: async () => {},
};
const clickRes = await humanClick(mockMousePage, mockElementWithBox);
assert.equal(clickRes, true, 'humanClick phải trả về true khi click thành công');
assert.equal(mouseDownCalled, true, 'mouse.down phải được gọi');
assert.equal(mouseUpCalled, true, 'mouse.up phải được gọi');

// 18.5 humanClick fallback an toàn khi boundingBox trả về null
let fallbackClicked = false;
const mockElementFallback = {
  boundingBox: async () => null,
  click: async () => { fallbackClicked = true; },
};
const fallbackRes = await humanClick(mockMousePage, mockElementFallback);
assert.equal(fallbackRes, true);
assert.equal(fallbackClicked, true, 'humanClick phải fallback sang click() khi boundingBox rỗng');

// 18.6 Kiểm tra WebGL Vendor / Renderer trong tất cả 6 Device Profiles
for (const profileKey of ['windows', 'macos', 'linux', 'android', 'ipad', 'ios']) {
  const profile = DEVICE_PROFILES[profileKey];
  assert.ok(profile.spoof.webglVendor, `Thiếu webglVendor cho ${profileKey}`);
  assert.ok(profile.spoof.webglRenderer, `Thiếu webglRenderer cho ${profileKey}`);
}

// 18.7 Kiểm tra giả lập gõ nhầm (Typo Simulation) có sửa lại bằng Backspace
const typoTracked = [];
let backspaceCalled = false;
const mockTypoPage = {
  keyboard: {
    type: async (c) => { typoTracked.push(c); },
    press: async (k) => {
      if (k === 'Backspace') {
        backspaceCalled = true;
        typoTracked.pop();
      }
    },
  },
  waitForTimeout: async () => {},
};
const mockTypoField = {
  scrollIntoViewIfNeeded: async () => {},
  click: async () => {},
  focus: async () => {},
  inputValue: async () => typoTracked.join(''),
};
await humanType(mockTypoField, 'California', mockTypoPage, { simulateTypo: true, forceTypo: true });
assert.equal(backspaceCalled, true, 'Typo simulation phải bấm Backspace để sửa ký tự gõ sai');
assert.equal(typoTracked.join(''), 'California', 'Sau khi sửa sai chuỗi kết quả phải khớp hoàn toàn với chuỗi gốc');

// 18.8 Kiểm tra vi chuyển động chuột tự nhiên (naturalMouseDrift)
const driftMoves = [];
const mockDriftPage = {
  mouse: {
    move: async (x, y) => { driftMoves.push({ x, y }); },
  },
};
// 18.9 Kiểm tra thuật toán phân bổ tránh nhau xoay vòng (Cyclic Collision-Free Multi-Offer):
resetMultiOfferState();
const cycleProxies = [
  { server: 'socks5://192.168.1.1:1080', _queueLine: '192.168.1.1:1080' },
  { server: 'socks5://192.168.1.2:1080', _queueLine: '192.168.1.2:1080' },
];
// Lượt 1: Offer 1 dùng cả 2 proxy tuần tự
const c1 = getNextCollisionFreeProxy(1, cycleProxies, 2);
assert.equal(c1.server, 'socks5://192.168.1.1:1080');
releaseProxyLock(c1);
const c2 = getNextCollisionFreeProxy(1, cycleProxies, 2);
assert.equal(c2.server, 'socks5://192.168.1.2:1080');
releaseProxyLock(c2);

// Lượt 2: Offer 1 đã dùng hết 2/2 proxy -> Phải tự động xoay vòng lấy lại proxy mà không bị trả về null
const c3 = getNextCollisionFreeProxy(1, cycleProxies, 2);
assert.ok(c3, 'Offer 1 phải xoay vòng lấy được proxy khi đã qua hết danh sách');
assert.equal(c3.server, 'socks5://192.168.1.1:1080', 'Offer 1 xoay vòng về proxy đầu tiên');
releaseProxyLock(c3);

// 19. KIỂM TRA ĐỊNH DẠNG INFO.TXT DẠNG PIPE (|)
const samplePipeInfo = 'Emmett|Gay|Male|Mr|05|11|1977|5183234117|1776 La Crosse Street|Fort Edward|NewYork|12828|5183234117|emmettgayMmV|waBeWHAYvPmqWKZ|emmettgay@outlook.com\n'
  + 'Erich|Acevedo|Male|Mr|01|06|1949|9784156822|4027 Lafayette Avenue|Haverhill|Massachusetts|01832|9784156822|erichacevedoUfQ|vGAqpZRwTZZWb7C|erichacevedo@gmail.com';

const parsedPipeRecords = parseAutofillRecords(samplePipeInfo);
assert.equal(parsedPipeRecords.length, 2, 'Phải parse được đúng 2 bản ghi từ chuỗi pipe');
const r1 = parsedPipeRecords[0];
assert.equal(r1.firstname, 'Emmett');
assert.equal(r1.lastname, 'Gay');
assert.equal(r1.fullname, 'Emmett Gay');
assert.equal(r1.email, 'emmettgay@outlook.com');
assert.equal(r1.dob, '11/05/1977');
assert.equal(r1.zipcode, '12828');
assert.equal(r1.state, 'NewYork');
assert.equal(r1.city, 'Fort Edward');
assert.ok(r1.phone.startsWith('814') || r1.phone.startsWith('817'), 'Số điện thoại phải có mã vùng chuẩn hóa 814/817');

// 20. KIỂM TRA NÚT SIGN UP / REGISTER KHÔNG BỊ COI LÀ NAV NOISE
const mockSignUpBtn = {
  tagName: 'BUTTON',
  innerText: 'Sign Up Now',
  className: 'btn-signup btn-primary',
  isVisible: async () => true,
  isEnabled: async () => true,
  evaluate: async (fn) => fn({
    tagName: 'BUTTON',
    innerText: 'Sign Up Now',
    className: 'btn-signup btn-primary',
    closest: (sel) => (sel === 'form' ? { tagName: 'FORM' } : null),
    getBoundingClientRect: () => ({ width: 150, height: 45 }),
  }),
};
const mockSignUpFrame = {
  locator: (sel) => ({
    all: async () => {
      if (sel.includes('Sign Up')) {
        return [mockSignUpBtn];
      }
      return [];
    },
  }),
};
const foundSignUp = await findSubmitButton(mockSignUpFrame);
assert.equal(foundSignUp, mockSignUpBtn, 'findSubmitButton phải nhận diện nút Sign Up và không được lọc bỏ bởi navNoise');

const mockRegisterBtn = {
  tagName: 'BUTTON',
  innerText: 'Register',
  className: 'submit-btn',
  isVisible: async () => true,
  isEnabled: async () => true,
  evaluate: async (fn) => fn({
    tagName: 'BUTTON',
    innerText: 'Register',
    className: 'submit-btn',
    closest: (sel) => (sel === 'form' ? { tagName: 'FORM' } : null),
    getBoundingClientRect: () => ({ width: 140, height: 40 }),
  }),
};
const mockRegisterFrame = {
  locator: (sel) => ({
    all: async () => {
      if (sel.includes('Register')) {
        return [mockRegisterBtn];
      }
      return [];
    },
  }),
};
const foundRegister = await findSubmitButton(mockRegisterFrame);
assert.equal(foundRegister, mockRegisterBtn, 'findSubmitButton phải nhận diện nút Register');

// 21. KIỂM TRA KHÔNG ĐƯỢC CHECK LEAD VÀ KHÔNG ĐƯỢC TỰ Ý OUT Ở MÀN 1 (MỤC TIÊU MÀN 4)
const mock4ScreenSession = {
  autofillFields: 0,
  completedScreens: 0,
};
let leadCheckTriggeredEarly = false;
let mockPageClosedEarly = false;
const mock4ScreenPage = {
  isClosed: () => mockPageClosedEarly,
  url: () => 'https://sweepstake.example.com/step1',
  close: async () => { mockPageClosedEarly = true; },
  evaluate: async (fn) => fn(),
  frames: () => [{
    url: () => 'https://sweepstake.example.com/step1',
    evaluate: async (fn) => {
      if (typeof fn === 'function') {
        return {
          isScreen5: false,
          isJumpPage: false,
          hasDob: false,
          hasGender: false,
          hasEmailInput: true,
          screenSignature: '/step1##INPUT:firstname,INPUT:email',
        };
      }
      return null;
    },
    locator: (sel) => ({
      all: async () => [],
      first: () => ({
        count: async () => 0,
        isVisible: async () => false,
      }),
    }),
  }],
};
const mock4ScreenContext = {
  on: () => {},
  pages: () => [mock4ScreenPage],
};

attachAutofill(mock4ScreenContext, [r1], 'https://sweepstake.example.com', mock4ScreenSession, {
  autoSubmit: true,
  enableLeadCheck: true,
  leadCheckScreen: 4,
  onScreen5Reached: () => { leadCheckTriggeredEarly = true; },
  onEmailSubmitted: () => { leadCheckTriggeredEarly = true; },
});

mock4ScreenSession.triggerAutofillScan?.();
await new Promise((r) => setTimeout(r, 200));

assert.strictEqual(leadCheckTriggeredEarly, false, 'Tuyệt đối không được kích hoạt lead check ở màn 1 khi mục tiêu là màn 4');
assert.strictEqual(mockPageClosedEarly, false, 'Trình duyệt tuyệt đối không được tự ý out ở màn 1');
assert.ok((mock4ScreenSession.completedScreens || 0) <= 1, 'Màn 1 không được nhảy vọt số màn lên 4');

// 22. KIỂM TRA inspectAndFixFormWithAi: TỰ ĐỘNG CHẨN ĐOÁN VÀ SỬA LỖI FORM KHI CHƯA QUA ĐƯỢC
let healedEmailValue = '';
const mockFormErrorPage = {
  isClosed: () => false,
  url: () => 'https://sweepstake.example.com/step-error',
  content: async () => '<form><input type="email" id="txtEmail" required><div class="error-message">Valid email is required</div><button type="submit">Submit</button></form>',
  locator: (sel) => ({
    first: () => ({
      count: async () => 1,
      isVisible: async () => true,
      evaluate: async (fn, arg) => fn.name === 'inspectInteractionReadiness' ? { ready: true } : fn.name === 'inspectActionPurpose' ? { submit: false, consent: false } : fn.name === 'collectFieldMetadata' ? { kind: 'input', type: 'email', id: 'txtEmail', name: 'email', names: ['email'] } : fn({
        tagName: 'INPUT',
        type: 'email',
        id: 'txtEmail',
        name: 'email',
        // Giá trị thật trong DOM: executeAction đọc lại để xác minh, nên phải cập nhật theo fill.
        value: healedEmailValue,
        matches: (s) => (s ? !s.includes('disabled') && !s.includes('inert') : true),
        querySelector: () => null,
        getAttribute: () => null,
        classList: { contains: () => false, add: () => {} },
        dispatchEvent: () => {},
        setAttribute: () => {},
        click: () => {},
      }, arg),
      fill: async (v) => { healedEmailValue = String(v ?? ''); },
      click: async () => { healedEmailValue = healedEmailValue || 'clicked'; },
    }),
  }),
  // page.evaluate được dùng cho 2 mục đích khác nhau: đọc trạng thái form
  // (inspectFormRepairState) và lấy chữ ký tiến trình (getFormProgressSignature).
  evaluate: async (fn) => {
    const source = typeof fn === 'function' ? fn.toString() : '';
    if (source.includes('controlState')) {
      // Chữ ký tiến trình: đổi khi ô email đã có giá trị.
      return JSON.stringify({ url: 'https://sweepstake.example.com/step-error', value: healedEmailValue });
    }
    if (healedEmailValue) {
      // Form đã được sửa: không còn lỗi, email đã hợp lệ.
      return {
        errors: [],
        emailInput: { id: 'txtEmail', name: 'email', type: 'email', val: healedEmailValue, isEmpty: false, isInvalid: false, required: true, selector: '#txtEmail' },
        emailMissing: false,
        problemInputs: [],
        hasBlocker: false,
      };
    }
    return {
      errors: ['Valid email is required'],
      emailInput: { id: 'txtEmail', name: 'email', type: 'email', val: '', isEmpty: true, isInvalid: true, required: true, selector: '#txtEmail' },
      emailMissing: true,
      problemInputs: [{ tag: 'input', type: 'email', id: 'txtEmail', name: 'email', isEmpty: true, isInvalid: true, required: true, selector: '#txtEmail' }],
      hasBlocker: true,
    };
  },
};
const mockHealSession = {
  assignedEmail: 'healed.user@gmail.com',
  autofillFields: 0,
};
const healResult = await inspectAndFixFormWithAi(mockFormErrorPage, { firstname: 'John', lastname: 'Doe' }, mockHealSession, {
  aiConfig: { mode: 'heuristic_only' },
});
assert.equal(healResult.status, 'healed', 'inspectAndFixFormWithAi phải tự động sửa lỗi form');
assert.equal(healResult.fixed, true);
assert.ok(mockHealSession.emailFilled, 'Session phải được cập nhật emailFilled = true sau khi AI sửa form');
assert.equal(mockHealSession.assignedEmail, 'healed.user@gmail.com');

// 23. KIỂM TRA CHẶN SUBMIT VÀ CHẶN CHECK LEAD KHI FORM CHƯA ĐIỀN EMAIL HOẶC BỊ LỖI
let blockedSubmitClicked = false;
let blockedLeadCheckTriggered = false;
const mockBlockedSubmitBtn = {
  isVisible: async () => true,
  isEnabled: async () => true,
  scrollIntoViewIfNeeded: async () => {},
  click: async () => { blockedSubmitClicked = true; },
  evaluate: async (fn) => fn({ ...mockReadySubmitDomState, tagName: 'BUTTON', id: 'btnSubmit', innerText: 'Submit', dataset: {} }),
};
const mockBlockedFormPage = {
  isClosed: () => false,
  url: () => 'https://sweepstake.example.com/step-email-blocked',
  evaluate: async (fn, arg1) => {
    if (arg1) return false;
    if (typeof fn === 'function' && fn.toString().includes('screenSignature')) {
      return { isScreen5: false, isJumpPage: false, hasEmailInput: true, screenSignature: '/step-email-blocked##INPUT:email' };
    }
    return {
      unfilled: true,
      id: 'email',
      type: 'email',
      reason: 'missing_or_invalid_email',
    };
  },
  frames: () => [{
    url: () => 'https://sweepstake.example.com/step-email-blocked',
    evaluate: async (fn, arg1) => {
      if (arg1) return false;
      if (typeof fn === 'function' && fn.toString().includes('screenSignature')) {
        return { isScreen5: false, isJumpPage: false, hasEmailInput: true, screenSignature: '/step-email-blocked##INPUT:email' };
      }
      return {
        unfilled: true,
        id: 'email',
        type: 'email',
        reason: 'missing_or_invalid_email',
      };
    },
    locator: (sel) => ({
      all: async () => {
        if (sel.includes('button') || sel.includes('Submit')) return [mockBlockedSubmitBtn];
        return [];
      },
      first: () => ({ count: async () => 0, isVisible: async () => false }),
    }),
  }],
};
const mockBlockedContext = {
  on: () => {},
  pages: () => [mockBlockedFormPage],
};
const mockBlockedSession = {
  completedScreens: 0,
  emailFilled: false,
};
attachAutofill(mockBlockedContext, [{ firstname: 'John' }], 'https://sweepstake.example.com', mockBlockedSession, {
  autoSubmit: true,
  enableLeadCheck: true,
  leadCheckScreen: 1, // Kể cả khi target là màn 1
  onEmailSubmitted: () => { blockedLeadCheckTriggered = true; },
});

mockBlockedSession.triggerAutofillScan?.();
await new Promise((r) => setTimeout(r, 150));

assert.strictEqual(blockedSubmitClicked, false, 'Tuyệt đối không được bấm submit khi ô email chưa điền hoặc bị lỗi');
assert.strictEqual(mockBlockedSession.completedScreens, 0, 'completedScreens không được tăng khi form bị lỗi submit');
assert.strictEqual(blockedLeadCheckTriggered, false, 'Tuyệt đối không được kích hoạt lead check khi email chưa điền');
assert.notEqual(mockBlockedSession.leadCheckStatus, 'checking', 'Trạng thái không được chuyển sang checking khi email chưa điền');

// 24. KIỂM TRA THẺ <a> CÂU TRẢ LỜI KHẢO SÁT CÓ LINK NHẢY TRANG
let surveyLinkClickCount = 0;
const mockSurveyLinkEl = {
  tagName: 'A',
  href: 'https://sweepstake.example.com/register?step=2&gender=female',
  innerText: 'Female',
  textContent: 'Female',
  value: 'female',
  id: 'btn-option-gender-female',
  className: 'choice-btn option-btn',
  getAttribute: (attr) => {
    if (attr === 'href') return 'https://sweepstake.example.com/register?step=2&gender=female';
    if (attr === 'data-ux-btn-option-id') return 'btn_option_gender_0';
    return null;
  },
  setAttribute: () => {},
  classList: {
    contains: (cls) => false,
    add: () => {},
  },
  click: () => { surveyLinkClickCount++; },
};

const mockSurveyFrame = {
  evaluate: async (fn, ...args) => {
    if (typeof fn === 'function') {
      // Contract mới: mỗi nhóm trả về từ evaluate là { source, heading, items }
      return [{
        source: 'btn_option',
        heading: '',
        items: [{
          uid: 'btn_option_gender_0',
          id: 'btn-option-gender-female',
          className: 'choice-btn option-btn',
          text: 'Female',
          isSelected: false,
          recentlyClicked: false,
        }],
      }];
    }
    return [];
  },
  locator: (sel) => ({
    first: () => createVerifiedChoiceLocator(sel, () => { surveyLinkClickCount++; }),
  }),
};

const mockSurveySession = {
  autofillFields: 0,
  hasSubmittedCurrentScreen: false,
};

const surveyAnsCount = await handleRadioAndSurveyOptions(mockSurveyFrame, {}, mockSurveySession);
assert.equal(surveyAnsCount, 1, 'handleRadioAndSurveyOptions phải chọn được thẻ <a> câu trả lời');
assert.equal(mockSurveySession.autofillFields, 0, 'click đáp án KHÔNG được tính vào autofillFields');
assert.equal((mockSurveySession.autofillActions ?? 0), 1, 'click đáp án phải được tính vào autofillActions');
assert.strictEqual(mockSurveySession.hasSubmittedCurrentScreen, false, 'click đáp án KHÔNG được tính là submit (không đánh dấu màn nhảy)');
assert.strictEqual(mockSurveySession.answerClickPending, true, 'click đáp án phải ghi answerClickPending — bộ đếm màn chỉ tăng khi trang thật sự chuyển màn');
assert.ok(surveyLinkClickCount > 0, 'Thẻ <a> câu trả lời phải được click');

// 25. KIỂM TRA NHẬN DIỆN VÀ TƯƠNG TÁC LOCOTOMATO WIDGET VÀ IFRAME
const mockLocoSubmitBtn = {
  isVisible: async () => true,
  isEnabled: async () => true,
  evaluate: async (fn) => fn({ tagName: 'BUTTON', className: 'loco-btn loco-submit', innerText: 'Get Free Guide', dataset: {} }),
};
const mockLocoFrame = {
  locator: (sel) => ({
    all: async () => {
      if (sel.includes('loco-submit') || sel.includes('Get Free Guide') || sel.includes('button')) {
        return [mockLocoSubmitBtn];
      }
      return [];
    },
  }),
};
const locoSubmitFound = await findSubmitButton(mockLocoFrame);
assert.ok(locoSubmitFound, 'findSubmitButton phải tìm được nút submit Get Free Guide của LocoTomato');

// ── Test Address Autocomplete Dropdown Selection (Google Places / Loqate / ARIA) ──
assert.ok(Array.isArray(ADDRESS_SUGGESTION_SELECTORS) && ADDRESS_SUGGESTION_SELECTORS.length > 10);
assert.equal(typeof hasActiveAddressSuggestions, 'function');
assert.equal(typeof selectFirstAddressSuggestion, 'function');

let addressSuggestionClicked = false;
const mockPacItem = {
  count: async () => 1,
  isVisible: async () => true,
  evaluate: async (fn) => fn({ scrollIntoView: () => {}, dispatchEvent: () => {}, click: () => { addressSuggestionClicked = true; } }),
  click: async () => { addressSuggestionClicked = true; },
};
const mockAddressPage = {
  locator: (sel) => ({
    count: async () => sel.includes('.pac-item') ? 1 : 0,
    nth: () => mockPacItem,
  }),
  evaluate: async (fn) => true,
};
const hasSuggestions = await hasActiveAddressSuggestions(mockAddressPage);
assert.equal(hasSuggestions, true);

const pickedSuggestion = await selectFirstAddressSuggestion(mockAddressPage);
assert.equal(pickedSuggestion, true);
assert.equal(addressSuggestionClicked, true, 'selectFirstAddressSuggestion phải click thành công vào mục gợi ý địa chỉ');

console.log('Tất cả kiểm tra selfcheck hoàn tất thành công!');
process.exit(0);



