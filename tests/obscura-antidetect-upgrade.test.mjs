import './helpers/obscura-data-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openObscuraBrowser } from '../src/obscura-engine/index.mjs';
import { obscuraTlsProfile } from '../src/obscura-engine/open-obscura-browser.mjs';
import { generateObscuraProfile } from '../src/obscura-engine/generate-obscura-profile.mjs';
import { moduleState } from '../src/logging/browser-logs/state/module-state.mjs';

test.after(() => {
  clearTimeout(moduleState.saveBrowserLogsTimer);
});

/**
 * Mở Obscura với danh tính phiên trên một trang HTTP cục bộ và đo các bề mặt vân tay của kế hoạch nâng cấp
 * (OBSCURA_ANTIDETECT_UPGRADE_PLAN.md): WebGL, font, giọng đọc, media, WebRTC, navigator, độ ổn định nhiễu.
 * @param {string} os Hệ điều hành của profile.
 * @return {Promise<{first: object, second: object}>} Kết quả đo ở hai lần điều hướng của cùng phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
async function probeSession(os) {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end('<html><body><div><span id="probe" style="font-size:72px">mmmmmmmmmmlli</span></div></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const session = await openObscuraBrowser({ slot: 41, os, registerSession: false, seed: 4242,
    geo: { ip: '203.0.113.7', timezone: 'America/New_York', country: 'US' } });
  const probe = () => session.page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 16;
    const gl = canvas.getContext('webgl');
    const pixels = new Uint8Array(8);
    gl.readPixels(0, 0, 2, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const c2d = document.createElement('canvas').getContext('2d');
    const width = font => { c2d.font = font; return c2d.measureText('mmmmmmmmmmlli').width; };
    const draw = document.createElement('canvas'); draw.width = 40; draw.height = 10;
    draw.getContext('2d').fillRect(0, 0, 40, 10);
    const buffer = new OfflineAudioContext(1, 4096, 44100).createBuffer(1, 4096, 44100);
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.example.org:3478' }] });
    pc.createDataChannel('probe');
    const candidates = [];
    await new Promise(async done => {
      pc.onicecandidate = event => { if (event.candidate) candidates.push(event.candidate); else done(); };
      await pc.setLocalDescription(await pc.createOffer());
      setTimeout(done, 3000);
    });
    const span = document.getElementById('probe');
    const spanWidth = family => { span.style.fontFamily = family; return span.offsetWidth; };
    const domFonts = ['Arial', 'Segoe UI', 'Calibri', 'Helvetica Neue', 'Menlo', 'Roboto', 'Liberation Sans', 'DejaVu Sans']
      .filter(font => [['monospace'], ['sans-serif'], ['serif']].some(([base]) => spanWidth(`"${font}", ${base}`) !== spanWidth(base)));
    const worker = await new Promise(resolve => {
      const w = new Worker(URL.createObjectURL(new Blob(['postMessage([navigator.platform, navigator.hardwareConcurrency])'])));
      w.onmessage = event => resolve(event.data);
      setTimeout(() => resolve('timeout'), 3000);
    });
    return {
      domFonts, worker, spanWidth: spanWidth('monospace'),
      navigatorTag: Object.prototype.toString.call(navigator),
      navigatorProto: Object.getPrototypeOf(navigator) === Navigator.prototype,
      screenOwnProps: Object.getOwnPropertyNames(screen),
      innerInsideOuter: innerWidth <= outerWidth && innerHeight <= outerHeight,
      engineGlobals: Object.getOwnPropertyNames(window).filter(k => /obscura|antidetect/i.test(k)),
      hookedConstructible: [HTMLCanvasElement.prototype.getContext, HTMLCanvasElement.prototype.toDataURL,
        CanvasRenderingContext2D.prototype.getImageData, WebGLRenderingContext.prototype.readPixels]
        .filter(fn => 'prototype' in fn).map(fn => fn.name),
      imageData: document.createElement('canvas').getContext('2d').getImageData(0, 0, 1, 1) instanceof ImageData,
      platform: navigator.platform, hw: navigator.hardwareConcurrency,
      webgl: gl instanceof WebGLRenderingContext,
      glOwnProps: Object.getOwnPropertyNames(gl).length,
      renderer: gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL),
      precision: gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT).precision,
      pixels: Array.from(pixels).join(','),
      fonts: { mono: width('50px monospace'), segoe: width('50px "Segoe UI", monospace'), menlo: width('50px Menlo, monospace'),
        proportional: (c2d.font = '50px sans-serif', c2d.measureText('iiii').width !== c2d.measureText('WWWW').width) },
      voice: speechSynthesis.getVoices()[0]?.name,
      media: (await navigator.mediaDevices.enumerateDevices()).map(d => `${d.kind}:${d.deviceId}`),
      candidates: candidates.map(c => `${c.type}:${c.address}`),
      navigatorOwnProps: Object.getOwnPropertyNames(navigator),
      platformGetter: Function.prototype.toString.call(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(navigator), 'platform').get),
      canvasStable: draw.toDataURL() === draw.toDataURL(),
      audioStable: buffer.getChannelData(0)[0] === buffer.getChannelData(0)[0],
    };
  });
  try {
    await session.configureContext(session.context);
    await session.page.goto(url);
    const first = await probe();
    await session.page.goto(`${url}?next`);
    return { first, second: await probe() };
  } finally {
    await session.close();
    server.close();
  }
}

test('profile TLS của engine khớp thiết bị: Safari cho iPhone/iPad, Chrome theo nền tảng', () => {
  assert.equal(obscuraTlsProfile(generateObscuraProfile({ seed: 1, os: 'windows' })), 'chrome-windows');
  assert.equal(obscuraTlsProfile(generateObscuraProfile({ seed: 1, os: 'mac' })), 'chrome-macos');
  assert.equal(obscuraTlsProfile(generateObscuraProfile({ seed: 1, os: 'android' })), 'chrome-android');
  assert.equal(obscuraTlsProfile(generateObscuraProfile({ seed: 1, os: 'iphone' })), 'safari-ios');
  assert.equal(obscuraTlsProfile(generateObscuraProfile({ seed: 1, os: 'ipad' })), 'safari-ipad');
});

test('Obscura có danh tính: WebGL/font/giọng đọc/media/WebRTC như Windows thật và ổn định giữa các trang', { timeout: 90000 }, async () => {
  const { first, second } = await probeSession('windows');
  assert.equal(first.webgl, true, 'máy thật luôn có WebGL');
  assert.equal(first.glOwnProps, 0);
  assert.match(first.renderer, /Direct3D11/);
  assert.equal(first.precision, 23);
  assert.notEqual(first.pixels, '0,0,0,0,0,0,0,0', 'WebGL không được trống');
  assert.equal(first.pixels, second.pixels, 'vân tay WebGL giữ nguyên khi chuyển trang');
  assert.notEqual(first.fonts.segoe, first.fonts.mono, 'Segoe UI có trên Windows');
  assert.equal(first.fonts.menlo, first.fonts.mono, 'Menlo không có trên Windows');
  assert.equal(first.fonts.proportional, true);
  assert.match(first.voice, /^Microsoft /);
  assert.deepEqual(first.media, ['audioinput:', 'videoinput:', 'audiooutput:'], 'trước khi cấp quyền ID phải rỗng');
  assert.deepEqual(first.candidates.map(c => c.split(':')[0]), ['host', 'srflx']);
  assert.match(first.candidates[0], /\.local$/, 'IP cục bộ ẩn bằng mDNS');
  assert.equal(first.candidates[1], 'srflx:203.0.113.7', 'WebRTC lộ đúng IP proxy');
  assert.deepEqual(first.navigatorOwnProps, []);
  assert.equal(first.platformGetter, 'function get platform() { [native code] }');
  assert.equal(first.canvasStable, true);
  assert.equal(first.audioStable, true);
  assert.deepEqual(first.domFonts, ['Arial', 'Segoe UI', 'Calibri'], 'dò font DOM chỉ thấy font của Windows');
  assert.ok(first.spanWidth > 0, '<span> phải có kích thước');
  assert.deepEqual(first.worker, [first.platform, first.hw], 'Worker chạy và khớp danh tính');
  assert.equal(first.navigatorTag, '[object Navigator]');
  assert.equal(first.navigatorProto, true);
  assert.deepEqual(first.screenOwnProps, []);
  assert.equal(first.innerInsideOuter, true, 'innerWidth/innerHeight không được lớn hơn outer');
  assert.deepEqual(first.engineGlobals, []);
  assert.deepEqual(first.hookedConstructible, [], 'hàm native không có prototype');
  assert.equal(first.imageData, true);
});

test('Obscura có danh tính: profile Mac dùng font/giọng đọc/GPU Metal của Mac', { timeout: 90000 }, async () => {
  const { first } = await probeSession('mac');
  assert.match(first.renderer, /ANGLE Metal Renderer: Apple M/);
  assert.notEqual(first.fonts.menlo, first.fonts.mono, 'Menlo có trên Mac');
  assert.equal(first.fonts.segoe, first.fonts.mono, 'Segoe UI không có trên Mac');
  assert.equal(first.voice, 'Samantha');
  assert.deepEqual(first.domFonts, ['Arial', 'Helvetica Neue', 'Menlo']);
});

test('Obscura có danh tính: Safari iPhone không có deviceMemory/userAgentData/window.chrome', { timeout: 90000 }, async () => {
  const server = http.createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end('<html><body>ok</body></html>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const session = await openObscuraBrowser({ slot: 42, os: 'iphone', registerSession: false, seed: 4242,
    geo: { ip: '203.0.113.7', timezone: 'America/New_York', country: 'US' } });
  try {
    await session.configureContext(session.context);
    await session.page.goto(`http://127.0.0.1:${server.address().port}/`);
    const safari = await session.page.evaluate(() => ({ deviceMemory: 'deviceMemory' in navigator,
      userAgentData: 'userAgentData' in navigator, chrome: 'chrome' in window, media: navigator.mediaDevices.enumerateDevices().then(d => d.length) }));
    assert.deepEqual({ ...safari, media: undefined }, { deviceMemory: false, userAgentData: false, chrome: false, media: undefined });
  } finally {
    await session.close();
    server.close();
  }
});
