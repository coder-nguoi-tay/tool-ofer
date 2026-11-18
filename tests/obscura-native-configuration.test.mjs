import './helpers/obscura-data-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { openObscuraBrowser, obscuraViewport } from '../src/obscura-engine/open-obscura-browser.mjs';
import { buildObscuraStealthScript } from '../src/obscura-engine/build-obscura-stealth-script.mjs';
import { resolveObscuraBinary } from '../src/obscura-engine/resolve-obscura-binary.mjs';
import { chromium } from 'playwright';
import { startObscuraSession } from '../src/obscura-engine/start-obscura-session.mjs';
import { stopObscuraSession } from '../src/obscura-engine/stop-obscura-session.mjs';
import { findFreePort } from '../src/obscura-engine/find-free-port.mjs';
import { generateObscuraProfile } from '../src/obscura-engine/generate-obscura-profile.mjs';
let available = true;
try { resolveObscuraBinary(); } catch { available = false; }

const html = '<!doctype html><html><head><script>window.initialNative={ua:navigator.userAgent,languages:navigator.languages,dpr:devicePixelRatio,width:innerWidth,height:innerHeight,rtc:typeof RTCPeerConnection}</script></head><body><div id="rectangle" style="width:120px;height:50px">Fixture</div><iframe src="/frame"></iframe></body></html>';

/**
 * Dựng fixture HTTP loopback; không dùng dữ liệu hay trang offer thật.
 * @param {object} t Test context để dọn server/phiên.
 * @return {Promise<object>} URL fixture và danh sách request.
 * @throws {Error} Khi không bind được loopback.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
async function fixture(t) {
  const requests = [];
  const details = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url);
    details.push({ url: request.url, time: Date.now(), headers: request.headers });
    response.setHeader('content-type', 'text/html');
    const path = new URL(request.url, 'http://fixture.invalid').pathname;
    if (path === '/slow.js') {
      response.setHeader('content-type', 'application/javascript');
      setTimeout(() => response.end('window.slowLoaded=true'), 1300);
    } else if (path === '/meta-slow') response.end('<html><head><meta http-equiv="refresh" content="1;url=/destination"><script src="/slow.js"></script></head><body>Fixture</body></html>');
    else if (path === '/meta-removed') response.end('<html><head><meta id="refresh" http-equiv="refresh" content="1;url=/destination"></head><body><script>setTimeout(()=>document.getElementById("refresh").remove(),100)</script></body></html>');
    else if (path === '/meta-invalid-first') response.end('<html><head><meta http-equiv="refresh" content="invalid"><meta http-equiv="refresh" content="0;url=/destination"></head><body>Fixture</body></html>');
    else if (path === '/meta') response.end('<html><head><base href="/base/"><meta http-equiv="refresh" content="1; URL=next?tracking=fixture"></head><body>Native refresh</body></html>');
    else if (path === '/frame-meta') response.end('<html><body><iframe src="/meta"></iframe></body></html>');
    else response.end(path === '/frame' ? '<html><body>Frame fixture<iframe src="/leaf"></iframe></body></html>' : path === '/leaf' ? '<html><body>Leaf fixture</body></html>' : html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { origin: `http://127.0.0.1:${server.address().port}`, requests, details };
}

test('Obscura không còn script của app để vá Web API hoặc che lỗi engine', async () => {
  const source = await readFile(new URL('../src/obscura-engine/open-obscura-browser.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /addInitScript|stealthInitScript|buildStealthConfig/);
  assert.equal(buildObscuraStealthScript({ antiFingerprint: { canvas: true, clientRects: true, fonts: true } }), '');
});

test('API native đọc cấu hình từ Rust ngay lần chạy đầu, trong iframe và sau reload', { skip: !available, timeout: 30000 }, async t => {
  const { origin } = await fixture(t);
  const session = await openObscuraBrowser({ slot: 971, port: 0, os: 'android', seed: 4242, registerSession: false,
    geo: { ll: [40.75, -73.5], country: 'FR', timezone: 'Europe/Paris' } });
  t.after(() => session.close());
  await session.page.goto(origin + '/native');
  const metrics = obscuraViewport(session.profile);
  const initial = await session.page.evaluate(() => window.initialNative);
  assert.equal(initial.ua, session.profile.user_agent);
  assert.deepEqual(initial.languages, session.profile.languages);
  assert.equal(initial.dpr, session.profile.screen.device_pixel_ratio);
  assert.deepEqual([initial.width, initial.height], [metrics.width, metrics.height]);
  assert.equal(initial.rtc, 'undefined', 'không dựng ICE/SDP giả khi không có backend');
  const probe = async page => page.evaluate(async () => {
    const permission = await navigator.permissions.query({ name: 'notifications' });
    const battery = await navigator.getBattery();
    const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject));
    return { permission: [permission.state, permission instanceof PermissionStatus, permission instanceof EventTarget],
      battery: [battery instanceof BatteryManager, battery instanceof EventTarget, battery === await navigator.getBattery()],
      position: [position.coords.latitude, position.coords.longitude], languages: navigator.languages,
      identityGlobal: '__obscura_identity' in window, positionGlobal: '__obscura_geo_lat' in window,
      plugin: navigator.plugins[0].item(0) instanceof MimeType, dpr: devicePixelRatio,
    };
  });
  const expected = { permission: ['prompt', true, true], battery: [true, true, true], position: [40.75, -73.5],
    languages: session.profile.languages, identityGlobal: false, positionGlobal: false, plugin: true, dpr: session.profile.screen.device_pixel_ratio };
  assert.deepEqual(await probe(session.page), expected);
  const frame = session.page.frames().find(frame => frame.url() === origin + '/frame');
  assert.ok(frame);
  assert.deepEqual(await probe(frame), expected);
  await session.page.reload();
  assert.deepEqual(await probe(session.page), expected);
  const cdp = await session.context.newCDPSession(session.page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: metrics.width, height: metrics.height, deviceScaleFactor: 2, mobile: true });
  assert.equal(await session.page.evaluate(() => devicePixelRatio), 2);
  for (const path of ['/frame', '/leaf']) {
    const liveFrame = session.page.frames().find(frame => frame.url() === origin + path);
    assert.ok(liveFrame, path);
    assert.equal(await liveFrame.evaluate(() => devicePixelRatio), 2);
  }
  await session.page.reload();
  assert.equal(await session.page.evaluate(() => devicePixelRatio), 2);
  assert.equal(await session.page.frames().find(frame => frame.url() === origin + '/leaf').evaluate(() => devicePixelRatio), 2);
  await cdp.detach();
});

test('Safari dùng capability native, không còn API Chromium do script của app thêm vào', { skip: !available, timeout: 20000 }, async t => {
  const { origin } = await fixture(t);
  const session = await openObscuraBrowser({ slot: 972, port: 0, os: 'iphone', registerSession: false });
  t.after(() => session.close());
  await session.page.goto(origin + '/native');
  assert.deepEqual(await session.page.evaluate(() => ({ chrome: 'chrome' in window, hints: 'userAgentData' in navigator,
    memory: 'deviceMemory' in navigator, battery: 'getBattery' in navigator, connection: 'connection' in navigator,
    standalone: navigator.standalone, pdf: navigator.pdfViewerEnabled, plugins: navigator.plugins.length })),
  { chrome: false, hints: false, memory: false, battery: false, connection: false, standalone: false, pdf: false, plugins: 0 });
});

test('meta refresh do Rust xử lý khi client không poll, gồm base URL và iframe', { skip: !available, timeout: 15000 }, async t => {
  const { origin, requests } = await fixture(t);
  const session = await openObscuraBrowser({ slot: 973, port: 0, registerSession: false });
  t.after(() => session.close());
  await session.page.goto(origin + '/meta');
  await new Promise(resolve => setTimeout(resolve, 1600));
  assert.ok(requests.includes('/base/next?tracking=fixture'), 'native timer tự đánh thức renderer');
  assert.equal(session.page.url(), origin + '/base/next?tracking=fixture');
  requests.length = 0;
  await session.page.goto(origin + '/frame-meta');
  await new Promise(resolve => setTimeout(resolve, 1600));
  assert.ok(requests.includes('/base/next?tracking=fixture'), 'refresh thuộc iframe phải điều hướng iframe');
  assert.equal(session.page.url(), origin + '/frame-meta');
});


test('UA native đồng bộ HTTP, fetch/XHR và không làm đổi trang chạy song song', { skip: !available, timeout: 30000 }, async t => {
  const { origin, details } = await fixture(t);
  const native = await startObscuraSession({ port: await findFreePort(0) });
  t.after(() => stopObscuraSession(native.process));
  const browser = await chromium.connectOverCDP(native.cdpEndpoint);
  t.after(() => browser.close());
  const context = browser.contexts()[0];
  const first = context.pages()[0] || await context.newPage();
  const second = await context.newPage();
  const profiles = ['mac', 'android'].map(os => generateObscuraProfile({ os, seed: 4242 }));
  for (const [index, page] of [first, second].entries()) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setBrowserIdentity', { profile: profiles[index] });
    await page.goto(origin + '/profile-only-' + index);
    const nativeRequest = details.find(request => request.url === '/profile-only-' + index);
    assert.equal(nativeRequest.headers['user-agent'], profiles[index].user_agent);
    assert.equal(nativeRequest.headers['accept-language'], profiles[index].languages.join(','));
    assert.equal(await page.evaluate(() => navigator.userAgent), profiles[index].user_agent);
    await cdp.send('Network.setUserAgentOverride', { userAgent: profiles[index].user_agent, acceptLanguage: 'fr-FR,fr' });
    await cdp.detach();
  }
  for (const [index, page] of [first, second, first].entries()) {
    const profile = profiles[index % 2];
    const suffix = String(index);
    await page.goto(origin + '/identity-' + suffix);
    assert.equal(await page.evaluate(() => navigator.userAgent), profile.user_agent);
    await page.evaluate(async suffix => {
      await fetch('/fetch-' + suffix);
      await new Promise((resolve, reject) => { const xhr = new XMLHttpRequest(); xhr.onload = resolve; xhr.onerror = reject; xhr.open('GET', '/xhr-' + suffix); xhr.send(); });
    }, suffix);
    for (const path of ['/identity-', '/fetch-', '/xhr-']) {
      const request = details.find(request => request.url === path + suffix);
      assert.ok(request, path);
      assert.equal(request.headers['user-agent'], profile.user_agent);
      assert.equal(request.headers['accept-language'], 'fr-FR,fr');
    }
  }
  const cdp = await context.newCDPSession(first);
  await cdp.send('Emulation.setUserAgentOverride', { userAgent: 'NativeRegression/1.0', acceptLanguage: 'de-DE,de;q=0.9' });
  assert.deepEqual(await first.evaluate(() => [navigator.userAgent, navigator.language, navigator.languages]),
    ['NativeRegression/1.0', 'de-DE', ['de-DE', 'de']]);
  const frame = first.frames().find(frame => frame.url() === origin + '/frame');
  assert.ok(frame);
  assert.equal(await frame.evaluate(() => navigator.userAgent), 'NativeRegression/1.0');
  await first.reload();
  assert.equal(await first.evaluate(() => navigator.userAgent), 'NativeRegression/1.0');
  assert.equal(details.filter(request => request.url === '/identity-2').at(-1).headers['user-agent'], 'NativeRegression/1.0');
  await cdp.send('Network.setExtraHTTPHeaders', { headers: { 'x-fixture': 'kept' } });
  await first.evaluate(() => fetch('/after-headers'));
  const afterHeaders = details.find(request => request.url === '/after-headers');
  assert.equal(afterHeaders.headers['user-agent'], 'NativeRegression/1.0');
  assert.equal(afterHeaders.headers['accept-language'], 'de-DE,de;q=0.9');
  assert.equal(afterHeaders.headers['x-fixture'], 'kept');
  await cdp.detach();
});

test('meta refresh đợi load xong, giữ lịch khi xóa thẻ và bỏ qua thẻ không hợp lệ', { skip: !available, timeout: 20000 }, async t => {
  const { origin, details } = await fixture(t);
  const session = await openObscuraBrowser({ slot: 974, port: 0, registerSession: false });
  t.after(() => session.close());
  await session.page.goto(origin + '/meta-slow');
  const loadedAt = Date.now();
  await new Promise(resolve => setTimeout(resolve, 1500));
  const redirect = details.find(request => request.url === '/destination');
  assert.ok(redirect);
  assert.ok(redirect.time - loadedAt >= 850, `redirect after load: ${redirect.time - loadedAt}ms`);
  for (const path of ['/meta-removed', '/meta-invalid-first']) {
    details.length = 0;
    await session.page.goto(origin + path);
    await new Promise(resolve => setTimeout(resolve, 1400));
    assert.ok(details.some(request => request.url === '/destination'), path);
  }
});

test('Web Audio không quảng cáo backend tạo PCM giả', { skip: !available, timeout: 20000 }, async t => {
  const { origin } = await fixture(t);
  const session = await openObscuraBrowser({ slot: 975, port: 0, registerSession: false });
  t.after(() => session.close());
  await session.page.goto(origin + '/native');
  assert.deepEqual(await session.page.evaluate(() => [typeof AudioContext, typeof OfflineAudioContext, typeof webkitAudioContext]),
    ['undefined', 'undefined', 'undefined']);
});

test('CDP Geolocation Override áp dụng tọa độ theo Geo IP khi mở phiên Obscura', { skip: !available, timeout: 20000 }, async t => {
  const { origin } = await fixture(t);
  const session = await openObscuraBrowser({
    slot: 976,
    port: 0,
    registerSession: false,
    geo: { ll: [21.0285, 105.8542], timezone: 'Asia/Bangkok' },
    antiFingerprint: { apiFakeIP: true },
  });
  t.after(() => session.close());
  await session.page.goto(origin + '/native');
  const coords = await session.page.evaluate(() => new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve([pos.coords.latitude, pos.coords.longitude]),
      err => reject(new Error(err.message)),
      { timeout: 3000 },
    );
  }));
  assert.deepEqual(coords, [21.0285, 105.8542]);
});
