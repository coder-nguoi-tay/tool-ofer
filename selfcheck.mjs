import assert from 'node:assert/strict';
import {
  buildProxyCheckReport,
  buildMacChromeUserAgent,
  buildUsedExitIpList,
  createProxyProfileKey,
  hasTrafficBlocked,
  isRetryableGologinServiceFailure,
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
assert.equal(createProxyProfileKey(rotatingProxy, 1), createProxyProfileKey(sameProxyNewPassword, 1));
assert.notEqual(createProxyProfileKey(rotatingProxy, 1), createProxyProfileKey(rotatingProxy, 2));
assert.notEqual(
  createProxyProfileKey(rotatingProxy, 1),
  createProxyProfileKey({ ...rotatingProxy, username: 'v' }, 1),
);
assert.notEqual(
  createProxyProfileKey(rotatingProxy, 1),
  createProxyProfileKey({ ...rotatingProxy, server: 'socks5://1.2.3.4:1081' }, 1),
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

// Lỗi GoLogin (quota/429) không được đốt proxy: bản ghi cũ và mới đều phải thử lại được.
assert.equal(isRetryableGologinServiceFailure(undefined), false);
assert.equal(isRetryableGologinServiceFailure({ status: 'service_error' }), true);
assert.equal(isRetryableGologinServiceFailure({
  status: 'failed',
  exitIp: null,
  reason: 'Unexpected token \'T\', "Too many requests" is not valid JSON',
}), true);
assert.equal(isRetryableGologinServiceFailure({
  status: 'failed',
  exitIp: null,
  reason: 'Unexpected token \'Y\', "You have r"... is not valid JSON',
}), true);
// Đã lấy được IP thoát nghĩa là IP đó đã dùng thật, không thử lại.
assert.equal(isRetryableGologinServiceFailure({
  status: 'failed',
  exitIp: '1.2.3.4',
  reason: 'Too many requests',
}), false);
// Lỗi thật của proxy vẫn bị loại vĩnh viễn.
assert.equal(isRetryableGologinServiceFailure({
  status: 'failed',
  exitIp: null,
  reason: 'Proxy Error. Proxy Error. Socket closed',
}), false);
assert.equal(isRetryableGologinServiceFailure({ status: 'success', exitIp: '1.2.3.4' }), false);

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

// UA dựng theo major phải khớp định dạng Chrome macOS hiện hành và chỉ đổi số major.
assert.equal(
  buildMacChromeUserAgent(144),
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
);
assert.equal(buildMacChromeUserAgent(153).match(/Chrome\/(\d+)\.0\.0\.0/)[1], '153');
assert.notEqual(buildMacChromeUserAgent(144), buildMacChromeUserAgent(145));
assert.throws(() => buildMacChromeUserAgent(0));
assert.throws(() => buildMacChromeUserAgent('144'));
assert.throws(() => buildMacChromeUserAgent(144.5));

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
