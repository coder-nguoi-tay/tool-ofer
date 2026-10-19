import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBrandLists, buildStealthConfig, buildUserAgentOverride, createDeviceVariant, localeForCountry, stealthInitScript,
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
  // Nhiễu canvas/audio/rects/WebGL luôn bật để mỗi phiên khác nhau.
  const plain = buildStealthConfig(DEVICE_PROFILES.macos, {}, 7);
  assert.deepEqual(plain.noise, { canvas: true, clientRects: true, webgl: true, fonts: false, audio: true });
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
    const win = createDeviceVariant('windows', DEVICE_PROFILES.windows, seed);
    assert.ok(win.spoof.webglRenderer.startsWith(`ANGLE (${win.spoof.webglVendor.slice(13, -1)},`), 'Vendor và renderer GPU phải cùng hãng');
    const android = createDeviceVariant('android', DEVICE_PROFILES.android, seed);
    assert.deepEqual(android.viewport, { width: android.screen.width, height: android.screen.height });
    assert.ok(android.ua('150.0.7871.187').includes(`Android ${android.uaData.platformVersion.split('.')[0]}; ${android.uaData.model})`), 'UA Android phải khớp model và bản Android');
    assert.ok(android.ua('150.0.7871.187').includes('Chrome/150.0.7871.187'));
    const ios = createDeviceVariant('ios', DEVICE_PROFILES.ios, seed);
    assert.match(ios.ua('150.0.7871.187'), /iPhone OS \d+(_\d+)* like Mac OS X.*CriOS\/150\.0\.7871\.187/);
    assert.doesNotMatch(ios.ua('150.0.7871.187'), /OS 2\d_/, 'WebKit đóng băng UA ở 18_6, không có iOS 26 trong UA');
    if (win.spoof.hardwareConcurrency >= 12) assert.equal(win.spoof.deviceMemory, 8, 'Máy nhiều nhân phải có deviceMemory 8');
    assert.equal(buildStealthConfig(mac, {}, seed).uaData.platformVersion, mac.uaData.platformVersion, 'Init script phải biết platformVersion của máy');
  }
});
