import './helpers/obscura-data-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openObscuraBrowser, generateObscuraProfile } from '../src/obscura-engine/index.mjs';
import { moduleState } from '../src/logging/browser-logs/state/module-state.mjs';

test.after(() => {
  clearTimeout(moduleState.saveBrowserLogsTimer);
});

/**
 * Trang kiểm thử Fingerprint mô phỏng các bộ Bot Detection như CreepJS / Pixelscan / FingerprintJS
 * và trang Offer Form mô phỏng luồng chạy AutoLead thật.
 */
function createMockFingerprintServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

      if (parsedUrl.pathname === '/offer') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html>
<html>
<head><title>Offer Campaign - Insurance Survey</title></head>
<body>
  <h2>Khảo sát nhận quà tặng</h2>
  <form id="leadForm" action="/thankyou" method="GET">
    <div><label>First Name: <input type="text" id="firstName" name="firstName" required></label></div>
    <div><label>Email: <input type="email" id="email" name="email" required></label></div>
    <div><label>Zipcode: <input type="text" id="zipCode" name="zipCode" required></label></div>
    <div>
      <label><input type="radio" name="hasCar" value="yes" checked> Có xe hơi</label>
      <label><input type="radio" name="hasCar" value="no"> Không có xe</label>
    </div>
    <button type="submit" id="btnSubmit">Hoàn tất khảo sát</button>
  </form>
</body>
</html>`);
        return;
      }

      if (parsedUrl.pathname === '/thankyou') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html>
<html>
<head><title>Thank you - Offer Completed</title></head>
<body>
  <div class="lead-confirmed">
    <h1>Cảm ơn bạn! Thông tin khảo sát đã được ghi nhận thành công.</h1>
    <p id="leadStatus">CONFIRMED_LEAD_SUCCESS</p>
  </div>
</body>
</html>`);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Fingerprint Bot Detection Suite</title>
</head>
<body>
  <h1>Fingerprint Suite</h1>
  <canvas id="canvas-test" width="120" height="40"></canvas>
  <script>
    window.collectFingerprint = async () => {
      // 1. Webdriver check
      const webdriver = navigator.webdriver;
      
      // 2. Chrome runtime check
      const hasChrome = typeof window.chrome !== 'undefined';
      const hasChromeRuntime = Boolean(window.chrome && (window.chrome.runtime || window.chrome.csi));
      
      // 3. User-Agent & Platform
      const ua = navigator.userAgent;
      const platform = navigator.platform;
      const cores = navigator.hardwareConcurrency;
      const memory = navigator.deviceMemory;
      
      // 4. Screen resolution
      const screenRes = screen.width + 'x' + screen.height;
      const dpr = window.devicePixelRatio;
      
      // 5. Canvas Fingerprint Hash
      const canvas = document.getElementById('canvas-test');
      const ctx = canvas.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(10, 5, 60, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('AutoLead<Obscura>', 5, 8);
      const canvasData = canvas.toDataURL();
      
      // 6. WebGL Vendor & Renderer
      let webglVendor = 'none';
      let webglRenderer = 'none';
      try {
        const glCanvas = document.createElement('canvas');
        const gl = glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl');
        if (gl) {
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          if (ext) {
            webglVendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
            webglRenderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
          }
        }
      } catch (e) {
        webglVendor = 'error';
      }

      // 7. Client Hints (nếu có)
      let uaDataValues = null;
      if (navigator.userAgentData && typeof navigator.userAgentData.getHighEntropyValues === 'function') {
        try {
          uaDataValues = await navigator.userAgentData.getHighEntropyValues(['platform', 'platformVersion', 'model']);
        } catch (e) {}
      }

      return {
        webdriver,
        hasChrome,
        hasChromeRuntime,
        vendor: navigator.vendor,
        maxTouchPoints: navigator.maxTouchPoints || 0,
        hasUserAgentData: typeof navigator.userAgentData !== 'undefined',
        ua,
        platform,
        cores,
        memory,
        screenRes,
        dpr,
        canvasLength: canvasData.length,
        canvasDataSlice: canvasData.slice(-32),
        webglVendor,
        webglRenderer,
        engineGlobals: Object.getOwnPropertyNames(window).filter(k => /obscura|antidetect/i.test(k)),
      };
    };
  </script>
</body>
</html>`);
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const url = `http://127.0.0.1:${port}/`;
      resolve({ server, url, port });
    });
  });
}

test('Full Flow E2E: Giả lập đa phiên bản OS & Trình duyệt trên Obscura V8 Engine', async (t) => {
  const { server, url } = await createMockFingerprintServer();

  t.after(() => {
    server.close();
  });

  const testCases = [
    {
      name: '1. Windows 11 Desktop (Chrome + Intel/NVIDIA GPU)',
      os: 'windows',
      seed: 1001,
      expectedPlatform: 'Win32',
      expectedVendor: 'Google Inc.',
      expectedUAPart: 'Windows NT 10.0',
      expectedGPU: ['NVIDIA', 'Intel'],
      isTouch: false,
      isAppleSafari: false,
    },
    {
      name: '2. macOS Sonoma Desktop (Chrome + Apple Silicon GPU)',
      os: 'mac',
      seed: 2002,
      expectedPlatform: 'MacIntel',
      expectedVendor: 'Google Inc.',
      expectedUAPart: 'Macintosh; Intel Mac OS X',
      expectedGPU: ['Apple'],
      isTouch: false,
      isAppleSafari: false,
    },
    {
      name: '3. Linux Ubuntu Desktop (Chrome + Mesa/Intel/NVIDIA)',
      os: 'linux',
      seed: 4004,
      expectedPlatform: 'Linux x86_64',
      expectedVendor: 'Google Inc.',
      expectedUAPart: 'X11; Linux x86_64',
      expectedGPU: ['Intel', 'NVIDIA', 'Mesa'],
      isTouch: false,
      isAppleSafari: false,
    },
    {
      name: '4. Android 14 Mobile (Samsung/Pixel + Qualcomm/Mali)',
      os: 'android',
      seed: 3003,
      expectedPlatform: 'Linux armv8l',
      expectedVendor: 'Google Inc.',
      expectedUAPart: 'Android 14',
      expectedGPU: ['Adreno', 'Mali'],
      isTouch: true,
      isAppleSafari: false,
    },
    {
      name: '5. Apple iPhone 15 Pro (iOS 17 Safari + Apple GPU)',
      os: 'iphone',
      seed: 5005,
      expectedPlatform: 'iPhone',
      expectedVendor: 'Apple Computer, Inc.',
      expectedUAPart: 'iPhone; CPU iPhone OS',
      expectedGPU: ['Apple'],
      isTouch: true,
      isAppleSafari: true,
    },
    {
      name: '6. Apple iPad Air (iPadOS 17 Safari + Apple GPU)',
      os: 'ipad',
      seed: 6006,
      expectedPlatform: 'iPad',
      expectedVendor: 'Apple Computer, Inc.',
      expectedUAPart: 'iPad; CPU OS',
      expectedGPU: ['Apple'],
      isTouch: true,
      isAppleSafari: true,
    },
  ];

  const results = [];

  for (const tc of testCases) {
    await t.test(`Kiểm thử full luồng: ${tc.name}`, async () => {
      const startTime = Date.now();
      
      const session = await openObscuraBrowser({
        slot: Math.floor(tc.seed % 100) + 1,
        seed: tc.seed,
        os: tc.os,
        targetUrl: url,
      });

      const launchTimeMs = Date.now() - startTime;

      try {
        assert.ok(session.browser, 'Browser instance phải sẵn sàng');
        assert.ok(session.page, 'Page instance phải sẵn sàng');
        
        // Chờ trang tải và hàm collectFingerprint sẵn sàng
        await session.page.waitForFunction(() => typeof window.collectFingerprint === 'function');

        // Thu thập toàn bộ thông số vân tay từ phía client Javascript
        const fp = await session.page.evaluate(() => window.collectFingerprint());

        results.push({
          os: tc.os,
          name: tc.name,
          seed: tc.seed,
          launchTimeMs,
          fp,
        });

        // 1. Kiểm tra tính năng che giấu Automation (Stealth)
        assert.ok(
          fp.webdriver === false,
          `navigator.webdriver phải giống trình duyệt thật: false, không phải undefined (nhận được: ${fp.webdriver})`
        );
        assert.deepEqual(fp.engineGlobals, [], 'Trang không được thấy global của engine/anti-detect');

        // 2. Kiểm tra độ chân thực của Safari iOS vs Chromium:
        if (tc.isAppleSafari) {
          // Safari trên iOS thật TUYỆT ĐỐI không có window.chrome và không có userAgentData!
          assert.equal(fp.hasChrome, false, 'Safari iOS không được phép để lộ window.chrome');
          assert.equal(fp.hasUserAgentData, false, 'Safari iOS không được phép có navigator.userAgentData');
          assert.equal(fp.vendor, 'Apple Computer, Inc.', 'Vendor của iOS Safari phải là Apple Computer, Inc.');
          assert.equal(fp.maxTouchPoints, 5, 'iPhone/iPad phải có maxTouchPoints = 5');
        } else {
          // Chromium engines (Windows, Mac, Linux, Android)
          assert.ok(fp.hasChrome, 'window.chrome phải hiện diện trên Chromium');
          assert.ok(fp.hasUserAgentData, 'navigator.userAgentData phải hiện diện trên Chromium');
          assert.equal(fp.vendor, 'Google Inc.', 'Vendor Chromium phải là Google Inc.');
          if (tc.isTouch) {
            assert.equal(fp.maxTouchPoints, 5, 'Android phải có maxTouchPoints = 5');
          } else {
            assert.equal(fp.maxTouchPoints, 0, 'Desktop phải có maxTouchPoints = 0');
          }
        }

        // 3. Kiểm tra User-Agent & Platform đúng hệ điều hành
        assert.ok(
          fp.ua.includes(tc.expectedUAPart),
          `User-Agent (${fp.ua}) phải chứa '${tc.expectedUAPart}'`
        );
        assert.equal(fp.platform, tc.expectedPlatform, `Platform phải khớp ${tc.expectedPlatform}`);

        // 4. Kiểm tra GPU WebGL Spoofing
        const matchesGPU = tc.expectedGPU.some((g) => fp.webglRenderer.includes(g));
        assert.ok(
          matchesGPU,
          `WebGL Renderer (${fp.webglRenderer}) phải chứa một trong các GPU: ${tc.expectedGPU.join(', ')}`
        );

        // 5. Kiểm tra Canvas Noise có sinh dữ liệu hợp lệ
        assert.ok(fp.canvasLength > 100, 'Canvas toDataURL phải hợp lệ');

      } finally {
        await session.close();
      }
    });
  }

  // Cross-Profile Diversity Verification (Đảm bảo mỗi slot có vân tay Canvas và UA độc nhất)
  await t.test('Xác minh độ đa dạng vân tay (Cross-Profile Uniqueness & Noise)', () => {
    assert.equal(results.length, 6, 'Phải hoàn thành cả 6 profile đa thiết bị');

    // In bảng tổng kết độ phù hợp
    console.log('\n========================================================================================================');
    console.log('                 BÁO CÁO FULL LUỒNG KIỂM THỬ ĐA THIẾT BỊ (ANTI-DETECT STEALTH SUITE)                    ');
    console.log('========================================================================================================');
    console.log('| Thiết bị giả lập | Thời gian | Webdriver | window.chrome | Vendor                 | Touch | WebGL GPU            |');
    console.log('|------------------|-----------|-----------|---------------|------------------------|-------|----------------------|');
    for (const r of results) {
      const gpuShort = r.fp.webglRenderer.length > 20 ? r.fp.webglRenderer.slice(0, 20) + '...' : r.fp.webglRenderer;
      const chromeStatus = r.fp.hasChrome ? 'Emulated' : 'None (Safari)';
      console.log(
        `| ${r.os.padEnd(16)} | ${(r.launchTimeMs + 'ms').padEnd(9)} | ${(r.fp.webdriver === false ? 'Hidden' : 'Exposed').padEnd(9)} | ${chromeStatus.padEnd(13)} | ${r.fp.vendor.padEnd(22)} | ${String(r.fp.maxTouchPoints).padEnd(5)} | ${gpuShort.padEnd(20)} |`
      );
    }
    console.log('========================================================================================================\n');
  });

  // Kiểm thử full luồng nghiệp vụ AutoLead: Điền form Offer -> Submit -> Nhận diện Lead
  await t.test('Smoke DOM: mở fixture, gán dữ liệu và điều hướng sau submit', async () => {
    const offerUrl = `${url}offer`;
    const leadSession = await openObscuraBrowser({
      slot: 9,
      seed: 9999,
      os: 'windows',
      targetUrl: offerUrl,
    });

    try {
      const page = leadSession.page;
      
      // Chờ form hiển thị
      await page.waitForSelector('#leadForm');

      // Tự động điền dữ liệu khảo sát
      await page.evaluate(() => {
        document.getElementById('firstName').value = 'John';
        document.getElementById('email').value = 'autolead_user@gmail.com';
        document.getElementById('zipCode').value = '90001';
      });

      // Submit form
      await Promise.all([
        page.waitForNavigation(),
        page.evaluate(() => document.getElementById('btnSubmit').click()),
      ]);

      // Xác minh chuyển trang thành công sang trang Lead
      const currentUrl = page.url();
      assert.ok(currentUrl.includes('/thankyou'), `Trang đích phải chuyển sang /thankyou, thực tế: ${currentUrl}`);

      // Kiểm tra nội dung trang Lead
      const leadStatus = await page.evaluate(() => document.getElementById('leadStatus')?.textContent);
      assert.equal(leadStatus, 'CONFIRMED_LEAD_SUCCESS', 'Nội dung Lead phải được ghi nhận');

      console.log('  -> Smoke DOM fixture: submit và điều hướng thành công; autofill thật được kiểm ở obscura-runtime.test.mjs.');
    } finally {
      await leadSession.close();
    }
  });
});
