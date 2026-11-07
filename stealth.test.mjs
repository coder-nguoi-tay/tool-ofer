import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBrandLists,
  buildStealthConfig,
  buildUserAgentOverride,
  createDeviceVariant,
  localeForCountry,
  stealthInitScript,
  buildProfileCoherenceExpected,
  analyzeProfileCoherence,
  attachGuardedWorkerInjection,
} from './stealth.mjs';
import { DEVICE_PROFILES } from './app.mjs';

const toHeader = (brands) => brands.map(({ brand, version }) => `"${brand}";v="${version}"`).join(', ');

test('buildBrandLists khớp sec-ch-ua thật của Chrome/Brave', () => {
  assert.equal(toHeader(buildBrandLists('141.0.7390.37').brands), '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"');
  assert.equal(toHeader(buildBrandLists('155.0.1.2', 'Brave').brands), '"Brave";v="155", "Chromium";v="155", "Not(A:Brand";v="24"');
  assert.equal(toHeader(buildBrandLists('141.0.7390.37', null).brands), '"Chromium";v="141", "Not?A_Brand";v="8"');
  assert.deepEqual(buildBrandLists('141.0.7390.37').fullVersionList[1], { brand: 'Not?A_Brand', version: '8.0.0.0' });
});

test('localeForCountry chọn ngôn ngữ theo quốc gia IP', () => {
  assert.deepEqual(localeForCountry('US'), { locale: 'en-US', languages: ['en-US', 'en'] });
  assert.deepEqual(localeForCountry('de'), { locale: 'de-DE', languages: ['de-DE', 'de', 'en-US', 'en'] });
  assert.equal(localeForCountry(undefined).locale, 'en-US');
});

test('buildUserAgentOverride đồng bộ UA, platform và Client Hints', () => {
  const params = buildUserAgentOverride(DEVICE_PROFILES.windows, { version: '155.0.8037.98', channel: 'stable' }, ['en-US', 'en']);
  assert.match(params.userAgent, /Chrome\/155\.0\.8037\.98 /, 'UA phải mang số phiên bản đầy đủ');
  assert.equal(params.platform, 'Win32');
  assert.equal(params.acceptLanguage, 'en-US,en');
  assert.equal(params.userAgentMetadata.platform, 'Windows');
  assert.equal(params.userAgentMetadata.fullVersion, '155.0.8037.98');
  assert.ok(params.userAgentMetadata.brands.some((item) => item.brand === 'Google Chrome'));
  const ios = buildUserAgentOverride(DEVICE_PROFILES.ios, { version: '155.0.8037.98', channel: 'stable' }, ['en-US', 'en']);
  assert.equal(ios.userAgentMetadata, undefined);
  assert.equal(ios.platform, 'iPhone');
});

test('mọi profile có đủ dữ liệu giả lập', () => {
  for (const [key, profile] of Object.entries(DEVICE_PROFILES)) {
    assert.ok(profile.screen?.width > 0, `Thiếu screen cho ${key}`);
    assert.ok(profile.spoof.hardwareConcurrency > 0, `Thiếu hardwareConcurrency cho ${key}`);
    if (profile.spoof.uaPlatform !== 'iOS') assert.ok(profile.uaData?.platform, `Thiếu uaData cho ${key}`);
  }
});

test('stealthInitScript tự chứa, tuần tự hoá được', () => {
  const config = buildStealthConfig(DEVICE_PROFILES.macos, { canvas: true, clientRects: true, webgl: true, fonts: true }, 42);
  assert.doesNotThrow(() => new Function(`(${stealthInitScript.toString()})`));
  assert.equal(JSON.parse(JSON.stringify(config)).seed, 42);
  assert.equal(config.noise.audio, true);
  assert.deepEqual(config.noise, { canvas: true, clientRects: true, webgl: true, fonts: true, audio: true });
  const plain = buildStealthConfig(DEVICE_PROFILES.macos, {}, 7);
  assert.deepEqual(plain.noise, { canvas: false, clientRects: false, webgl: false, fonts: false, audio: true });
});

test('createDeviceVariant: cùng seed cùng máy, khác seed ra nhiều máy khác nhau', () => {
  for (const key of Object.keys(DEVICE_PROFILES)) {
    const a = createDeviceVariant(key, DEVICE_PROFILES[key], 123);
    const b = createDeviceVariant(key, DEVICE_PROFILES[key], 123);
    assert.equal(a.summary, b.summary, `Seed cố định phải ra cùng máy (${key})`);
    const summaries = new Set(Array.from({ length: 40 }, (_, i) => createDeviceVariant(key, DEVICE_PROFILES[key], i + 1).summary));
    assert.ok(summaries.size >= 4, `${key} phải có nhiều biến thể, chỉ có ${summaries.size}`);
  }
  assert.equal(DEVICE_PROFILES.macos.spoof.webglRenderer, 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)', 'Không được sửa profile gốc');
});

test('createDeviceVariant giữ các thông số đồng bộ với nhau', () => {
  for (let seed = 1; seed <= 60; seed += 1) {
    const mac = createDeviceVariant('macos', DEVICE_PROFILES.macos, seed, { width: 1200, height: 800 });
    assert.ok(mac.screen.width >= 1200 && mac.screen.height >= 800, 'Màn hình phải chứa được khung nhìn');
    assert.equal(mac.deviceScaleFactor, mac.spoof.dpr);
    assert.equal(mac.screen.availHeight, mac.screen.height - mac.screen.availTop);
    assert.match(mac.spoof.webglRenderer, /^ANGLE \(Apple, ANGLE Metal Renderer: Apple M\d/);
    assert.ok(mac.deviceVersion.startsWith('macOS '), 'macOS phải có deviceVersion rõ ràng');
    const win = createDeviceVariant('windows', DEVICE_PROFILES.windows, seed);
    assert.ok(win.spoof.webglRenderer.startsWith(`ANGLE (${win.spoof.webglVendor.slice(13, -1)},`), 'Vendor và renderer GPU phải cùng hãng');
    assert.ok(win.deviceVersion.startsWith('Windows '), 'Windows phải có deviceVersion rõ ràng');
    const android = createDeviceVariant('android', DEVICE_PROFILES.android, seed);
    assert.deepEqual(android.viewport, { width: android.screen.width, height: android.screen.height });
    assert.ok(android.ua('150.0.7871.187').includes(`Android ${android.uaData.platformVersion.split('.')[0]}; ${android.uaData.model})`), 'UA Android phải khớp model và bản Android');
    assert.ok(android.ua('150.0.7871.187').includes('Chrome/150.0.7871.187'));
    assert.ok(android.deviceVersion.startsWith('Android '), 'Android phải có deviceVersion');
    const ios = createDeviceVariant('ios', DEVICE_PROFILES.ios, seed);
    assert.match(ios.ua('150.0.7871.187'), /iPhone OS \d+(_\d+)* like Mac OS X.*CriOS\/150\.0\.7871\.187/);
    assert.doesNotMatch(ios.ua('150.0.7871.187'), /OS 2\d_/, 'WebKit đóng băng UA ở 18_6, không có iOS 26 trong UA');
    assert.ok(ios.deviceVersion.startsWith('iOS '), 'iOS phải có deviceVersion');
    if (win.spoof.hardwareConcurrency >= 12) assert.equal(win.spoof.deviceMemory, 8, 'Máy nhiều nhân phải có deviceMemory 8');
    assert.equal(buildStealthConfig(mac, {}, seed).uaData.platformVersion, mac.uaData.platformVersion, 'Init script phải biết platformVersion của máy');
  }
});

test('pickConfiguredUserAgent: lấy UA trong file và thay bản Chrome bằng bản engine', async () => {
  const { pickConfiguredUserAgent } = await import('./app.mjs');
  assert.equal(pickConfiguredUserAgent([], 1), null);
  const ua = pickConfiguredUserAgent([
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  ], 7);
  assert.equal(ua('155.0.8037.98'), 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.8037.98 Mobile Safari/537.36');
  const ios = pickConfiguredUserAgent(['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1'], 0);
  assert.match(ios('155.0.8037.98'), /CriOS\/155\.0\.8037\.98 /);
});

test('buildProfileCoherenceExpected: tạo đúng thông số kỳ vọng cho desktop và mobile', () => {
  const winExpected = buildProfileCoherenceExpected(DEVICE_PROFILES.windows, { webgl: true }, { timezoneId: 'America/New_York', languages: ['en-US', 'en'] });
  assert.equal(winExpected.platform, 'Win32');
  assert.equal(winExpected.webdriver, false);
  assert.equal(winExpected.userAgentContains, 'Windows');
  assert.equal(winExpected.timezone, 'America/New_York');
  assert.equal(winExpected.maxTouchPoints, 0);
  assert.equal(winExpected.isMobile, false);
  assert.ok(winExpected.webglRenderer.includes('NVIDIA') || winExpected.webglRenderer.includes('ANGLE'));

  const androidExpected = buildProfileCoherenceExpected(DEVICE_PROFILES.android, { webgl: false });
  assert.equal(androidExpected.isMobile, true);
  assert.equal(androidExpected.maxTouchPoints, 5);
  assert.equal(androidExpected.webglRenderer, null);
});

test('analyzeProfileCoherence: đánh giá chính xác độ nhất quán và phát hiện profile lai', () => {
  const expected = {
    platform: 'Win32',
    uaPlatform: 'Windows',
    userAgentContains: 'Windows',
    webdriver: false,
    hardwareConcurrency: 8,
    timezone: 'America/New_York',
    maxTouchPoints: 0,
    languages: ['en-US', 'en'],
    isMobile: false,
    hasChromeObject: true,
    pdfViewerEnabled: true,
    hasPlugins: true,
  };

  // Profile hoàn toàn nhất quán
  const perfectSnapshot = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    platform: 'Win32',
    webdriver: false,
    hardwareConcurrency: 8,
    languages: ['en-US', 'en'],
    timezone: 'America/New_York',
    maxTouchPoints: 0,
    clientHints: { platform: 'Windows', mobile: false },
    hasChromeObject: true,
    pdfViewerEnabled: true,
    pluginsLength: 5,
    mediaDevicesCount: 5,
    notificationPermission: 'default',
    notificationQueryState: 'prompt',
  };
  const resPerfect = analyzeProfileCoherence(perfectSnapshot, expected);
  assert.equal(resPerfect.consistent, true);
  assert.equal(resPerfect.score, 100);
  assert.equal(resPerfect.mismatches.length, 0);

  // Profile lai: webdriver true, platform Mac, timezone lệch
  const hybridSnapshot = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    platform: 'MacIntel',
    webdriver: true,
    hardwareConcurrency: 4,
    languages: ['vi-VN', 'vi'],
    timezone: 'Asia/Ho_Chi_Minh',
    maxTouchPoints: 0,
    clientHints: { platform: 'macOS', mobile: false },
    notificationPermission: 'default',
    notificationQueryState: 'denied',
    hasChromeObject: false,
    pdfViewerEnabled: false,
    pluginsLength: 0,
    mediaDevicesCount: 0,
  };
  const resHybrid = analyzeProfileCoherence(hybridSnapshot, expected);
  assert.equal(resHybrid.consistent, false);
  assert.ok(resHybrid.score < 50);
  assert.ok(resHybrid.mismatches.some((m) => m.key === 'webdriver' && m.severity === 'critical'));
  assert.ok(resHybrid.mismatches.some((m) => m.key === 'platform' && m.severity === 'high'));
  assert.ok(resHybrid.mismatches.some((m) => m.key === 'timezone' && m.severity === 'medium'));
  assert.ok(resHybrid.mismatches.some((m) => m.key === 'notificationPermission' && m.severity === 'critical'));
  assert.ok(resHybrid.mismatches.some((m) => m.key === 'hasChromeObject' && m.severity === 'high'));
  assert.ok(resHybrid.mismatches.some((m) => m.key === 'pdfViewerEnabled' && m.severity === 'medium'));
  assert.ok(resHybrid.mismatches.some((m) => m.key === 'plugins' && m.severity === 'medium'));
  assert.ok(resHybrid.mismatches.some((m) => m.key === 'mediaDevices' && m.severity === 'medium'));
});

test('buildProfileCoherenceExpected: nhận diện đúng cờ Chrome object, PDF Viewer và Plugins', () => {
  const win = buildProfileCoherenceExpected(DEVICE_PROFILES.windows);
  assert.equal(win.hasChromeObject, true);
  assert.equal(win.pdfViewerEnabled, true);
  assert.equal(win.hasPlugins, true);

  const ios = buildProfileCoherenceExpected(DEVICE_PROFILES.ios);
  assert.equal(ios.hasChromeObject, false);
  assert.equal(ios.pdfViewerEnabled, false);
  assert.equal(ios.hasPlugins, false);

  const android = buildProfileCoherenceExpected(DEVICE_PROFILES.android);
  assert.equal(android.hasChromeObject, true);
  assert.equal(android.pdfViewerEnabled, false);
  assert.equal(android.hasPlugins, false);
});

test('stealthInitScript: vá Permissions API, MediaDevices, window.chrome và Plugins', async () => {
  // Giả lập môi trường trình duyệt tối thiểu trong node
  function Navigator() {}
  Object.defineProperty(Navigator.prototype, 'plugins', {
    get() { return []; },
    configurable: true,
    enumerable: true,
  });
  Object.defineProperty(Navigator.prototype, 'pdfViewerEnabled', {
    get() { return false; },
    configurable: true,
    enumerable: true,
  });
  Object.defineProperty(Navigator.prototype, 'platform', {
    get() { return 'Win32'; },
    configurable: true,
    enumerable: true,
  });

  function MediaDevices() {}
  MediaDevices.prototype.enumerateDevices = async function () { return []; };

  const fakeNav = Object.create(Navigator.prototype);
  fakeNav.mediaDevices = Object.create(MediaDevices.prototype);

  const fakeGlobal = {
    navigator: fakeNav,
    Notification: { permission: 'default' },
    Permissions: function Permissions() {},
    window: {},
  };
  fakeGlobal.Permissions.prototype = {
    async query(param) {
      if (param?.name === 'notifications') return { state: 'denied' };
      return { state: 'prompt' };
    },
  };

  const cfg = buildStealthConfig(DEVICE_PROFILES.windows, { webgl: true }, 9999);
  
  // Chạy script vá trên fake global
  const runScript = new Function('cfg', 'G', `
    const globalThis = G;
    (${stealthInitScript.toString()})(cfg);
  `);
  runScript(cfg, fakeGlobal);

  // 1. Permissions query mapping prompt
  const perm = await fakeGlobal.Permissions.prototype.query({ name: 'notifications' });
  assert.equal(perm.state, 'prompt', 'Permissions.query phải trả về prompt thay vì denied');

  // 2. MediaDevices enumeration sinh 5 thiết bị
  const devices = await fakeGlobal.navigator.mediaDevices.enumerateDevices();
  assert.equal(devices.length, 5, 'MediaDevices rỗng phải được bù 5 thiết bị');
  assert.equal(devices.filter((d) => d.kind === 'audioinput').length, 2);
  assert.equal(devices.filter((d) => d.kind === 'audiooutput').length, 2);
  assert.equal(devices.filter((d) => d.kind === 'videoinput').length, 1);

  // 3. window.chrome consistency
  assert.ok(fakeGlobal.window.chrome, 'Phải có window.chrome trên desktop');
  assert.equal(typeof fakeGlobal.window.chrome.csi, 'function');
  assert.equal(typeof fakeGlobal.window.chrome.loadTimes, 'function');
  assert.equal(typeof fakeGlobal.window.chrome.app?.getIsInstalled, 'function');

  // 4. Plugins & pdfViewerEnabled
  assert.equal(fakeGlobal.navigator.pdfViewerEnabled, true);
  assert.equal(fakeGlobal.navigator.plugins.length, 5);
  assert.ok(fakeGlobal.navigator.plugins[0].name.includes('PDF'));
});

test('attachGuardedWorkerInjection: an toàn, opt-in và bỏ qua khi tắt', async () => {
  // Khi không bật (enabled=false), trả về null ngay lập tức mà không tác động context
  const resOff = await attachGuardedWorkerInjection(null, null, {}, { enabled: false });
  assert.equal(resOff, null);

  const mockContext = {
    newCDPSession: async () => ({
      send: async () => {},
      on: () => {},
      off: () => {},
      detach: async () => {},
    }),
  };
  const mockPage = { once: () => {} };
  const resOn = await attachGuardedWorkerInjection(mockContext, mockPage, { platform: 'Win32', hardwareConcurrency: 8 }, { enabled: true });
  assert.ok(resOn !== null);
  assert.ok(typeof resOn.cleanup === 'function');
  resOn.cleanup();
});
