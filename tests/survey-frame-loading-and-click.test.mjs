import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { chromium } from 'playwright';
import { waitForSurveyReady } from '../src/autofill/offers/2615/solver/survey/wait-for-survey-ready.mjs';
import { selectPageFormFrames } from '../src/autofill/offers/2615/solver/form-scope/select-page-form-frames.mjs';
import { selectActiveForm } from '../src/autofill/form-scope/select-active-form.mjs';
import { updateBrowserMousePointer } from '../src/autofill/interaction/update-browser-mouse-pointer.mjs';
import { handlePostScreenInput } from '../src/http/routes/screen/post-input.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';

test('Khảo sát: Đảm bảo khảo sát load ra đầy đủ và click chọn chính xác', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  await t.test('1. waitForSurveyReady chờ spinner biến mất và options render xong', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <html>
          <body>
            <div id="survey-box" class="survey-container">
              <div class="spinner" id="loading-spinner">Đang tải câu hỏi...</div>
              <div id="options-holder" style="display:none;">
                <button class="btn-option" id="btn-option-1">Đáp án A</button>
                <button class="btn-option" id="btn-option-2">Đáp án B</button>
              </div>
            </div>
            <script>
              setTimeout(() => {
                const sp = document.getElementById('loading-spinner');
                if (sp) sp.remove();
                const opt = document.getElementById('options-holder');
                if (opt) opt.style.display = 'block';
              }, 400);
            </script>
          </body>
        </html>
      `);

      const res = await waitForSurveyReady(page, { timeoutMs: 2500, intervalMs: 100 });
      assert.equal(res.ready, true);
      assert.equal(res.optionsCount, 2);
      assert.ok(res.waitedMs >= 350, `Thời gian chờ phải >= 350ms (thực tế: ${res.waitedMs}ms)`);
    } finally {
      await page.close();
    }
  });

  await t.test('2. waitForSurveyReady trả về false khi không có container khảo sát nào', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent('<html><body><h1>Trang tĩnh thông thường</h1></body></html>');
      const res = await waitForSurveyReady(page, { timeoutMs: 800, intervalMs: 100 });
      assert.equal(res.ready, false);
      assert.equal(res.reason, 'no_survey_container');
    } finally {
      await page.close();
    }
  });

  await t.test('3. waitForSurveyReady timeout an toàn khi spinner quay vĩnh viễn', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <html>
          <body>
            <div class="survey-container">
              <div class="spinner">Đang tải...</div>
            </div>
          </body>
        </html>
      `);
      const res = await waitForSurveyReady(page, { timeoutMs: 600, intervalMs: 100 });
      assert.equal(res.ready, false);
      assert.equal(res.reason, 'timeout_waiting_for_survey');
    } finally {
      await page.close();
    }
  });

  await t.test('4. selectPageFormFrames của Offer 2615 ưu tiên iframe khảo sát đang loading', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <html>
          <body>
            <button id="parent-continue">Continue Trang Cha</button>
            <iframe id="survey-frame" style="width:500px; height:400px;"></iframe>
          </body>
        </html>
      `);

      const childFrame = page.frames().find(f => f !== page.mainFrame());
      assert.ok(childFrame, 'Phải có iframe con');

      // Trong iframe: đang hiển thị survey-container với spinner (chưa có buttons câu hỏi)
      await childFrame.setContent(`
        <html>
          <body>
            <div class="survey-container">
              <div class="spinner">Loading questions...</div>
            </div>
          </body>
        </html>
      `);

      // selectPageFormFrames của Offer 2615 phải ưu tiên chọn iframe con đang loading thay vì trang cha
      const selectedFrames = await selectPageFormFrames(page);
      assert.equal(selectedFrames.length, 1);
      assert.equal(selectedFrames[0], childFrame, 'Frame được chọn phải là iframe khảo sát đang loading');
    } finally {
      await page.close();
    }
  });

  await t.test('5. updateBrowserMousePointer vẽ con trỏ HTML/SVG với Shadow DOM và transform', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent('<html><body><h1>Test Cursor</h1></body></html>');
      await page.evaluate(updateBrowserMousePointer, { x: 150, y: 250, pressed: true, track: false });

      const cursorInfo = await page.evaluate(() => {
        const el = document.querySelector('[data-autoleadpc-mouse-pointer]');
        if (!el) return null;
        const svg = el.shadowRoot?.querySelector('svg');
        const path = el.shadowRoot?.querySelector('path');
        return {
          hasElement: true,
          transform: el.style.transform,
          hasSvg: !!svg,
          pathFill: path?.getAttribute('fill'),
          dataPressed: el.getAttribute('data-pressed'),
        };
      });

      assert.ok(cursorInfo, 'Phần tử chuột ảo phải tồn tại trong DOM');
      assert.equal(cursorInfo.hasSvg, true);
      assert.ok(cursorInfo.transform.includes('150px') && cursorInfo.transform.includes('250px'));
      assert.equal(cursorInfo.pathFill, '#38bdf8', 'Màu chuột khi bấm phải là xanh dạ quang #38bdf8');
      assert.equal(cursorInfo.dataPressed, '1');
    } finally {
      await page.close();
    }
  });

  await t.test('6. handlePostScreenInput fallback và click thành công khi stream chưa mở', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.setContent(`
        <html>
          <body>
            <button id="my-target" onclick="this.innerText='CLICKED_SUCCESS'">Chưa bấm</button>
          </body>
        </html>
      `);

      const mockSession = {
        slot: 888,
        tileIndex: 887,
        browser: context,
        mainPage: page,
        isClosed: false
      };
      activeBrowsers.add(mockSession);

      try {
        const rect = await page.evaluate(() => {
          const r = document.getElementById('my-target').getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        const payload = JSON.stringify({
          type: 'click',
          x: rect.x,
          y: rect.y,
          button: 'left',
          clientWidth: 1280,
          clientHeight: 800
        });

        const reqMock = Readable.from([Buffer.from(payload)]);
        reqMock.method = 'POST';
        reqMock.url = '/screen/input/888';

        let responseCode = null;
        let responseJson = null;
        const resMock = {
          writeHead: (code, headers) => { responseCode = code; },
          end: (data) => {
            if (data) {
              try { responseJson = JSON.parse(data); } catch {}
            }
          }
        };

        const handled = await handlePostScreenInput(reqMock, resMock);
        assert.equal(handled, true);
        assert.equal(responseCode, 200);

        const btnText = await page.evaluate(() => document.getElementById('my-target').innerText);
        assert.equal(btnText, 'CLICKED_SUCCESS', 'Nút phải được click thành công qua cơ chế fallback');
      } finally {
        activeBrowsers.delete(mockSession);
      }
    } finally {
      await context.close();
    }
  });
});
