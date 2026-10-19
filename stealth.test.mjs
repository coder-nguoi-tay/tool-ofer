import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBrandLists, buildStealthConfig, buildUserAgentOverride, localeForCountry, reducedChromeVersion, stealthInitScript,
} from './stealth.mjs';
import { DEVICE_PROFILES } from './app.mjs';

const toHeader = (brands) => brands.map(({ brand, version }) => `"${brand}";v="${version}"`).join(', ');

test('buildBrandLists khớp sec-ch-ua thật của Chrome/Brave', () => {
  assert.equal(toHeader(buildBrandLists('141.0.7390.37').brands), '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"');
  assert.equal(toHeader(buildBrandLists('155.0.1.2', 'Brave').brands), '"Brave";v="155", "Chromium";v="155", "Not(A:Brand";v="24"');
  assert.equal(toHeader(buildBrandLists('141.0.7390.37', null).brands), '"Chromium";v="141", "Not?A_Brand";v="8"');
  assert.deepEqual(buildBrandLists('141.0.7390.37').fullVersionList[1], { brand: 'Not?A_Brand', version: '8.0.0.0' });
});

test('reducedChromeVersion giữ bản chính', () => {
  assert.equal(reducedChromeVersion('155.0.8037.98'), '155.0.0.0');
});

test('localeForCountry chọn ngôn ngữ theo quốc gia IP', () => {
  assert.deepEqual(localeForCountry('US'), { locale: 'en-US', languages: ['en-US', 'en'] });
  assert.deepEqual(localeForCountry('de'), { locale: 'de-DE', languages: ['de-DE', 'de', 'en-US', 'en'] });
  assert.equal(localeForCountry(undefined).locale, 'en-US');
});

test('buildUserAgentOverride đồng bộ UA, platform và Client Hints', () => {
  const params = buildUserAgentOverride(DEVICE_PROFILES.windows, { version: '155.0.8037.98', channel: 'stable' }, ['en-US', 'en']);
  assert.match(params.userAgent, /Chrome\/155\.0\.0\.0 /);
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
});
