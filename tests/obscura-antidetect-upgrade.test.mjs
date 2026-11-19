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
 * @since 2026-11-18
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
    if (gl) gl.readPixels(0, 0, 2, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const webgl2Canvas = document.createElement('canvas');
    const gl2 = webgl2Canvas.getContext('webgl2');
    const glData = gl ? canvas.toDataURL() : 'data:,';
    const c2d = document.createElement('canvas').getContext('2d');
    const width = font => { c2d.font = font; return c2d.measureText('mmmmmmmmmmlli').width; };
    const draw = document.createElement('canvas'); draw.width = 40; draw.height = 10;
    draw.getContext('2d').fillRect(0, 0, 40, 10);
    const buffer = new AudioBuffer({ numberOfChannels: 1, length: 4096, sampleRate: 44100 });
    const rtcSupported = typeof RTCPeerConnection === 'function';
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
      identityReadable: '__obscura_identity' in window,
      pluginTypes: { plugin: navigator.plugins[0] ? navigator.plugins[0] instanceof Plugin : null, mime: navigator.mimeTypes[0] ? navigator.mimeTypes[0] instanceof MimeType : null, item: navigator.plugins[0]?.item(0)?.type },
      engineGlobals: Object.getOwnPropertyNames(window).filter(k => /obscura|antidetect/i.test(k)),
      hookedConstructible: [HTMLCanvasElement.prototype.getContext, HTMLCanvasElement.prototype.toDataURL,
        CanvasRenderingContext2D.prototype.getImageData, WebGLRenderingContext.prototype.readPixels]
        .filter(fn => 'prototype' in fn).map(fn => fn.name),
      imageData: document.createElement('canvas').getContext('2d').getImageData(0, 0, 1, 1) instanceof ImageData,
      platform: navigator.platform, hw: navigator.hardwareConcurrency,
      webgl: gl instanceof WebGLRenderingContext,
      webgl2: gl2 instanceof WebGL2RenderingContext,
      glOwnProps: gl ? Object.getOwnPropertyNames(gl).length : 0,
      renderer: gl ? gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL) : null,
      precision: gl ? gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT).precision : null,
      pixels: Array.from(pixels).join(','),
      glDataSlice: glData.slice(-32),
      glDataStable: glData === canvas.toDataURL(),
      fonts: { mono: width('50px monospace'), segoe: width('50px "Segoe UI", monospace'), menlo: width('50px Menlo, monospace'),
        proportional: (c2d.font = '50px sans-serif', c2d.measureText('iiii').width !== c2d.measureText('WWWW').width) },
      voice: speechSynthesis.getVoices()[0]?.name,
      media: (await navigator.mediaDevices.enumerateDevices()).map(d => `${d.kind}:${d.deviceId}`),
      rtcSupported,
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

test('Obscura có danh tính: API native theo cấu hình Windows và ổn định giữa các trang', { timeout: 90000 }, async () => {
  const { first, second } = await probeSession('windows');
  assert.equal(first.webgl, true, 'danh tính native phải cung cấp WebGL context');
  assert.equal(first.webgl2, true, 'danh tính native phải cung cấp WebGL2 context');
  assert.equal(first.glOwnProps, 0);
  assert.match(first.renderer, /ANGLE/);
  assert.equal(second.renderer, first.renderer);
  assert.equal(second.pixels, first.pixels);
  assert.equal(second.glDataSlice, first.glDataSlice);
  assert.equal(first.glDataStable, true);
  assert.ok(first.precision > 0, 'shader precision phải có giá trị native');
  assert.notEqual(first.fonts.segoe, first.fonts.mono, 'Segoe UI có trên Windows');
  assert.equal(first.fonts.menlo, first.fonts.mono, 'Menlo không có trên Windows');
  assert.equal(first.fonts.proportional, true);
  assert.match(first.voice, /^Microsoft /);
  assert.deepEqual(first.media, ['audioinput:', 'videoinput:', 'audiooutput:'], 'trước khi cấp quyền ID phải rỗng');
  assert.equal(first.rtcSupported, false, 'không có backend WebRTC thì không dựng SDP/ICE giả');
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
  assert.equal(first.identityReadable, false);
  assert.deepEqual(first.pluginTypes, { plugin: true, mime: true, item: 'application/pdf' });
  assert.deepEqual(first.hookedConstructible, [], 'hàm native không có prototype');
  assert.equal(first.imageData, true);
});

test('Obscura có danh tính: profile Mac dùng font/giọng đọc/GPU Metal của Mac', { timeout: 90000 }, async () => {
  const { first } = await probeSession('mac');
  assert.match(first.renderer, /Apple/);
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

test('adapter legacy không tiêm bất kỳ hook nào dù bật checkbox nhiễu', async () => {
  const { buildObscuraStealthScript } = await import('../src/obscura-engine/build-obscura-stealth-script.mjs');
  assert.equal(buildObscuraStealthScript({ seed: 4242, os: 'windows', antiFingerprint: { clientRects: true } }), '');
  assert.equal(buildObscuraStealthScript({ antiFingerprint: { canvas: true, fonts: true } }), '');
});

/**
 * Đọc lại framebuffer qua CDP để kiểm tra quyền sở hữu context, biên ảnh và resize.
 * @return {Promise<void>} Hoàn tất sau khi đóng phiên kiểm thử cục bộ.
 * @throws {Error} Khi pixel hoặc trạng thái context sai.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
test('WebGL giữ clearColor qua resize, chỉ ghi vùng đọc hợp lệ và khóa loại context', async () => {
  const session = await openObscuraBrowser({ slot: 982, port: 0, registerSession: false, seed: 4242, os: 'windows' });
  try {
    for (const contextType of ['webgl', 'webgl2']) {
      const result = await session.page.evaluate(type => {
        const canvas2d = document.createElement('canvas');
        const context2d = canvas2d.getContext('2d');
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 2;
        const blankExport = canvas.toDataURL();
        const gl = canvas.getContext(type);

        /**
         * Lấy một pixel RGBA từ góc dưới bên trái của framebuffer.
         * @return {number[]} Bốn byte màu theo thứ tự RGBA.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-19
         */
        function readFirstPixel() {
          const bytes = new Uint8Array(4);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
          return Array.from(bytes);
        }

        const initial = readFirstPixel();
        gl.clearColor(1, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        canvas.width = canvas.width;
        const unchangedSize = readFirstPixel();
        const clipped = new Uint8Array(4 * 4 * 4 + 1).fill(77);
        gl.readPixels(-1, -1, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, clipped);
        const shortBuffer = new Uint8Array([9]);
        gl.readPixels(0, 0, 2, 2, gl.RGBA, gl.UNSIGNED_BYTE, shortBuffer);

        canvas.width = 4;
        const afterResize = readFirstPixel();
        gl.clear(gl.COLOR_BUFFER_BIT);
        return {
          initial, unchangedSize, afterResize, afterClear: readFirstPixel(), pendingError: gl.getError(),
          shortBuffer: Array.from(shortBuffer), clipped: Array.from(clipped),
          canExportBeforeAcquiringContext: blankExport.startsWith('data:image/png;base64,'),
          exclusive2d: !!context2d && canvas2d.getContext(type) === null,
          exclusiveWebgl: canvas.getContext('2d') === null && canvas.getContext(type) === gl,
        };
      }, contextType);

      assert.deepEqual(result.initial, [0, 0, 0, 0]);
      assert.deepEqual(result.unchangedSize, [255, 0, 0, 255]);
      assert.deepEqual(result.afterResize, [0, 0, 0, 0]);
      assert.deepEqual(result.afterClear, [255, 0, 0, 255]);
      assert.equal(result.pendingError, 0x0502, 'resize phải giữ lỗi INVALID_OPERATION chưa đọc');
      assert.deepEqual(result.shortBuffer, [9]);
      const expectedClipped = Array(65).fill(77);
      for (const offset of [20, 24, 36, 40]) expectedClipped.splice(offset, 4, 255, 0, 0, 255);
      assert.deepEqual(result.clipped, expectedClipped);
      assert.ok(result.canExportBeforeAcquiringContext && result.exclusive2d && result.exclusiveWebgl);
    }
  } finally {
    await session.close();
  }
});
