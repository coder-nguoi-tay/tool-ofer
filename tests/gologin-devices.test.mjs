import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { DEVICE_PROFILES } from '../src/runtime/constants/device-profiles.mjs';
import { buildGoLoginProfileRequest } from '../src/gologin-profile/build-gologin-profile-request.mjs';
import { getGoLoginDeviceSettings } from '../src/gologin-profile/get-device-settings.mjs';
import { configureGoLoginDevice } from '../src/browser/gologin/configure-device.mjs';

const devices = [
  ['windows', 'win', 'Win32'], ['macos', 'mac', 'MacIntel'], ['linux', 'lin', 'Linux x86_64'],
  ['android', 'android', 'Linux armv8l'], ['ios', 'mac', 'iPhone'], ['ipad', 'mac', 'iPad']
];
for (const [deviceProfile, os, platform] of devices) {
  test(`profile GoLogin ${deviceProfile}: OS nền/UA/platform/cảm ứng không lẫn Windows`, () => {
    const request = buildGoLoginProfileRequest({ deviceProfile });
    assert.equal(request.os, os);
    assert.equal(request.navigator.platform, platform);
    const device = DEVICE_PROFILES[deviceProfile];
    assert.equal(request.navigator.resolution, `${device.screen.width}x${device.screen.height}`);
    assert.equal(request.navigator.maxTouchPoints, device.hasTouch ? 5 : 0);
    if (device.isMobile) {
      assert.equal(request.screenWidth, device.screen.width);
      assert.equal(request.screenHeight, device.screen.height);
      assert.equal(request.devicePixelRatio, device.deviceScaleFactor);
    }
    if (deviceProfile === 'ios' || deviceProfile === 'ipad') {
      assert.ok(request.navigator.userAgent.includes(deviceProfile === 'ios' ? 'iPhone' : 'iPad'));
      assert.equal(request.navigator.userAgent.includes('Windows NT'), false);
      assert.equal(request.webGLMetadata.vendor, 'Apple Inc.');
      assert.equal(request.webGLMetadata.renderer, 'Apple GPU');
    }
  });
}

test('thiết bị ngoài danh mục phải báo lỗi thay vì âm thầm tạo Windows', () => {
  assert.throws(() => getGoLoginDeviceSettings('unknown-device'), /không hợp lệ/);
});

const html = 'data:text/html,' + encodeURIComponent('<meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline device test</title><input id="answer">');
// Android để Orbita tự lo UA/Client Hints nên không kiểm được trên Chromium thường; xem test mock bên dưới.
for (const deviceProfile of ['ios', 'ipad']) {
  test(`CDP ${deviceProfile} áp đúng UA/màn hình/cảm ứng, giữ qua reload và tab mới`, { skip: !existsSync(chromium.executablePath()) }, async t => {
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: null });
    const first = await context.newPage();
    const request = buildGoLoginProfileRequest({ deviceProfile });
    const session = { browser: context, _cdpBrowser: browser, slot: 1, mainPage: first,
      deviceProfile, userAgent: request.navigator.userAgent };
    await configureGoLoginDevice(session);
    for (const page of [first, await context.newPage()]) {
      await session.prepareDevicePage(page);
      await page.goto(html);
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt) await page.reload();
        const actual = await page.evaluate(() => ({ ua: navigator.userAgent, platform: navigator.platform,
          touch: navigator.maxTouchPoints, width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
        const expected = DEVICE_PROFILES[deviceProfile];
        assert.equal(actual.ua, request.navigator.userAgent);
        assert.equal(actual.platform, request.navigator.platform);
        assert.equal(actual.touch, 5);
        assert.equal(actual.width, expected.viewport.width);
        assert.equal(actual.height, expected.viewport.height);
        assert.equal(actual.dpr, expected.deviceScaleFactor);
        await page.locator('#answer').fill('offline');
        assert.equal(await page.locator('#answer').inputValue(), 'offline');
      }
    }
  });
}

test('độ phân giải di động tùy chỉnh đồng nhất giữa navigator và thông số mobile của SDK', () => {
  const profile = buildGoLoginProfileRequest({ deviceProfile: 'ios', resolution: '375_812' });
  assert.equal(profile.navigator.resolution, '375x812');
  assert.equal(profile.screenWidth, 375);
  assert.equal(profile.screenHeight, 812);
});

test('Orbita Android nhấn/thả qua touch để không gọi mousePressed bị treo; vẫn giữ hover', async () => {
  const { attachGoLoginAndroidTouchInput } = await import('../src/browser/gologin/attach-android-touch-input.mjs');
  const commands = [], moves = [];
  const page = { mouse: { move: async (x, y) => moves.push([x, y]), down: () => assert.fail('Không dispatch mousePressed'), up: () => assert.fail('Không dispatch mouseReleased') } };
  const context = { newCDPSession: async () => ({ send: async (method, params) => commands.push({ method, params }) }) };
  await attachGoLoginAndroidTouchInput(context, page, { width: 412, height: 915 });
  await page.mouse.move(30, 40); await page.mouse.down(); await page.mouse.move(40, 50); await page.mouse.up();
  assert.deepEqual(moves, [[30, 40]]);
  assert.deepEqual(commands.map(command => command.params.type), ['touchStart', 'touchMove', 'touchEnd']);
  assert.equal(commands[0].params.touchPoints[0].x, 30);
  assert.deepEqual(commands.at(-1).params.touchPoints, []);
});

test('máy tính/Android: không ghi đè UA/Client Hints của Orbita, chỉ bù header redirect bằng đúng giá trị Orbita', async () => {
  const hints = { brands: [{ brand: 'Chromium', version: '148' }], mobile: false, platform: 'Windows', platformVersion: '10.0.0',
    architecture: 'x86', bitness: '64', model: '', uaFullVersion: '148.0.7778.178',
    fullVersionList: [{ brand: 'Chromium', version: '148.0.7778.178' }, { brand: 'Google Chrome', version: '148.0.7778.178' }] };
  for (const deviceProfile of ['windows', 'windows11', 'macos-intel', 'macos-arm', 'linux', 'android']) {
    const commands = [], initScripts = [];
    let onPaused;
    const page = { isClosed: () => false };
    const context = { addInitScript: async () => initScripts.push(true), pages: () => [page], on: () => {}, newCDPSession: async () => ({
      send: async (method, params) => { commands.push({ method, params }); return {}; }, on: (event, handler) => { if (event === 'Fetch.requestPaused') onPaused = handler; }
    }) };
    await configureGoLoginDevice({ browser: context, mainPage: page, slot: 1, deviceProfile, orbitaClientHints: hints,
      userAgent: buildGoLoginProfileRequest({ deviceProfile, browserVersion: '148.0.7778.178' }).navigator.userAgent, _cdpBrowser: { version: () => '148.0.7778.178' } });
    assert.equal(commands.some(command => /UserAgentOverride|HardwareConcurrency/.test(command.method)), false, `${deviceProfile}: giữ UA/Client Hints/CPU gốc của Orbita`);
    assert.equal(initScripts.length, 0, `${deviceProfile}: không chèn script giả lập`);
    assert.ok(commands.some(command => command.method === 'Fetch.enable'), `${deviceProfile}: bù header cho request điều hướng`);
    await onPaused({ requestId: 'r1', request: { headers: { 'User-Agent': 'x' } } });
    const sent = Object.fromEntries(commands.find(command => command.method === 'Fetch.continueRequest').params.headers.map(header => [header.name, header.value]));
    assert.equal(sent['Sec-CH-UA-Platform-Version'], '"10.0.0"');
    assert.equal(sent['Sec-CH-UA-Full-Version'], '"148.0.7778.178"');
    assert.match(sent['Sec-CH-UA-Full-Version-List'], /"Google Chrome";v="148\.0\.7778\.178"/);
    const metrics = commands.find(command => command.method === 'Emulation.setDeviceMetricsOverride');
    if (deviceProfile === 'android') assert.deepEqual([metrics.params.width, metrics.params.height, metrics.params.mobile], [412, 915, true]);
    else assert.equal(metrics, undefined, `${deviceProfile}: giữ màn hình fingerprint GoLogin`);
  }
});

test('Android giả lập đúng màn hình fingerprint GoLogin của phiên, không dùng màn hình mặc định Pixel 8', async () => {
  const commands = [];
  const page = { isClosed: () => false };
  const context = { addInitScript: async () => {}, pages: () => [page], on: () => {}, newCDPSession: async () => ({
    send: async (method, params) => { commands.push({ method, params }); return {}; }, on: () => {}
  }) };
  await configureGoLoginDevice({ browser: context, mainPage: page, slot: 1, deviceProfile: 'android', orbitaClientHints: null,
    mobileScreen: { width: 320, height: 694, devicePixelRatio: 3.375 }, _cdpBrowser: { version: () => '150.0.7871.47' } });
  const metrics = commands.find(command => command.method === 'Emulation.setDeviceMetricsOverride').params;
  assert.deepEqual([metrics.width, metrics.height, metrics.deviceScaleFactor], [320, 694, 3.375]);
});
