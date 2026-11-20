import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { chromium } from 'playwright';
import { waitForSurveyReady } from '../src/autofill/offers/2615/solver/survey/wait-for-survey-ready.mjs';
import { selectPageFormFrames } from '../src/autofill/offers/2615/solver/form-scope/select-page-form-frames.mjs';
import { selectPageFormFrames as selectGenericFormFrames } from '../src/autofill/form-scope/select-page-form-frames.mjs';
import { humanClick } from '../src/autofill/human-click.mjs';
import { fillPageForms } from '../src/autofill/fill-page-forms.mjs';
import { fillPageForms as fillOffer2615Forms } from '../src/autofill/offers/2615/solver/fill-page-forms.mjs';
import { inspectFormFrameOwner } from '../src/browser/frames/inspect-form-frame-owner.mjs';
import { executeAction } from '../src/ai-assist/execute-action.mjs';
import { detectSmartFallbackAction } from '../src/ai-assist/detect-smart-fallback-action.mjs';
import { readVisiblePageState } from '../src/ai-assist/visible-state/read-visible-page-state.mjs';
import { inspectFormRepairState } from '../src/ai-assist/inspect-form-repair-state.mjs';
import { selectActiveForm } from '../src/autofill/form-scope/select-active-form.mjs';
import { updateBrowserMousePointer } from '../src/autofill/interaction/update-browser-mouse-pointer.mjs';
import { handlePostScreenInput } from '../src/http/routes/screen/post-input.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';
import { screencastSessions } from '../src/runtime/constants/screencast-sessions.mjs';

test('Screen View giữ đúng ô select qua ảnh dự phòng và nối lại stream', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext();
  const page = await context.newPage();
  const otherTab = await context.newPage();
  const slot = 889;
  const session = { slot, browser: context, mainPage: page };
  activeBrowsers.add(session);
  t.after(() => { activeBrowsers.delete(session); screencastSessions.delete(slot); });
  const server = createServer(handlePostScreenInput);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  /**
   * Gửi thao tác tay tới API Screen View đang chạy trên loopback.
   * @param {object} input Thao tác của người dùng tại ô chọn.
   * @return {Promise<Response>} Phản hồi từ handler thật.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-20
   */
  function postInput(input) {
    return fetch(`http://127.0.0.1:${server.address().port}/screen/input/${slot}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input)
    });
  }

  const form = '<select onchange="this.dataset.changes = String(Number(this.dataset.changes || 0) + 1)"><option>A</option><option>B</option><option disabled>C</option></select>';
  await page.setContent(form);
  await otherTab.setContent(form);
  const rect = await page.locator('select').boundingBox();
  const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const opened = await postInput({ type: 'mousedown', ...point });
  assert.equal(opened.status, 200);
  const { select } = await opened.json();
  assert.ok(select.uid);
  assert.deepEqual(select.options.map(option => option.label), ['A', 'B', 'C']);
  assert.equal((await postInput({ type: 'mouseup', ...point })).status, 200);
  assert.equal((await postInput({ type: 'select', uid: select.uid, index: 2 })).status, 400);
  session.mainPage = otherTab;
  assert.equal((await postInput({ type: 'select', uid: select.uid, index: 1 })).status, 409);
  assert.equal(await otherTab.locator('select').inputValue(), 'A');
  session.mainPage = page;
  assert.equal((await postInput({ type: 'select', uid: select.uid, index: 1 })).status, 200);
  assert.equal(await page.locator('select').inputValue(), 'B');
  assert.equal((await postInput({ type: 'select', uid: select.uid, index: 0 })).status, 409);

  const reopened = (await (await postInput({ type: 'click', ...point })).json()).select;
  const cdpClient = await context.newCDPSession(page);
  screencastSessions.set(slot, { page, cdpClient });
  assert.equal((await postInput({ type: 'select', uid: select.uid, index: 0 })).status, 409);
  await page.locator('option').first().evaluate(option => { option.disabled = true; });
  assert.equal((await postInput({ type: 'select', uid: reopened.uid, index: 0 })).status, 409);
  await page.locator('option').first().evaluate(option => { option.disabled = false; option.label = 'D'; });
  assert.equal((await postInput({ type: 'select', uid: reopened.uid, index: 0 })).status, 409);
  await page.locator('option').first().evaluate(option => { option.removeAttribute('label'); });
  assert.equal((await postInput({ type: 'select', uid: reopened.uid, index: 0 })).status, 200);
  assert.equal(await page.locator('select').inputValue(), 'A');
  assert.equal(await page.locator('select').getAttribute('data-changes'), '2');

  await page.setContent(`<select style="width:200px" oninput="events.push('input')" onchange="events.push('change')">
    <option hidden selected value="">Ẩn</option>
    <optgroup hidden label="Nhóm ẩn"><option>Không hiển thị</option></optgroup>
    <option style="display:none">Ẩn qua CSS</option>
    <option value="east">Cùng tên</option><option value="west">Cùng tên</option>
    <optgroup disabled label="Nhóm khóa"><option>Khóa</option></optgroup>
  </select><script>window.events = []</script>`);
  const menu = (await (await postInput({ type: 'click', ...point })).json()).select;
  assert.deepEqual(menu.options, [
    { label: 'Cùng tên', disabled: false }, { label: 'Cùng tên', disabled: false }, { label: 'Khóa', disabled: true }
  ]);
  assert.equal(menu.selectedIndex, -1);
  assert.equal((await postInput({ type: 'select', index: 0 })).status, 409);
  await page.locator('option[value="west"]').evaluate(option => option.before(option.previousElementSibling.cloneNode(true)));
  assert.equal((await postInput({ type: 'select', uid: menu.uid, index: 1 })).status, 409);
  await page.locator('option[value="west"]').evaluate(option => option.previousElementSibling.remove());
  await page.locator('option[value="east"]').evaluate(option => option.before(option.nextElementSibling));
  assert.equal((await postInput({ type: 'select', uid: menu.uid, index: 0 })).status, 409);
  assert.equal(await page.locator('select').inputValue(), '');

  const currentMenu = (await (await postInput({ type: 'click', ...point })).json()).select;
  await page.locator('select').evaluate(control => { control.hidden = true; });
  assert.equal((await postInput({ type: 'select', uid: currentMenu.uid, index: 0 })).status, 409);
  await page.locator('select').evaluate(control => { control.hidden = false; });
  await page.locator('option[value="west"]').evaluate(option => { option.hidden = true; });
  assert.equal((await postInput({ type: 'select', uid: currentMenu.uid, index: 0 })).status, 409);
  await page.locator('option[value="west"]').evaluate(option => { option.hidden = false; });
  assert.deepEqual(await page.evaluate(() => events), []);
  assert.equal((await postInput({ type: 'select', uid: currentMenu.uid, index: 0 })).status, 200);
  assert.equal(await page.locator('select').inputValue(), 'west');
  assert.deepEqual(await page.evaluate(() => events), ['input', 'change']);

  // Hai POST nhấn/nhả riêng có thể mở CDP ngược thứ tự khi dùng ảnh dự phòng.
  screencastSessions.delete(slot);
  await page.setContent('<button style="width:90px;height:40px">OK</button>');
  await page.evaluate(() => {
    window.pointerEvents = [];
    for (const event of ['mousedown', 'mouseup', 'click']) {
      document.addEventListener(event, () => window.pointerEvents.push(event));
    }
  });
  const newCDPSession = context.newCDPSession.bind(context);
  let firstConnectionStarted;
  const connecting = new Promise(resolve => { firstConnectionStarted = resolve; });
  t.mock.method(context, 'newCDPSession', async target => {
    firstConnectionStarted();
    await new Promise(resolve => setTimeout(resolve, 120));
    return newCDPSession(target);
  }, { times: 1 });
  const down = postInput({ type: 'mousedown', x: 20, y: 20 });
  await connecting;
  const up = postInput({ type: 'mouseup', x: 20, y: 20 });
  assert.deepEqual((await Promise.all([down, up])).map(result => result.status), [200, 200]);
  assert.deepEqual(await page.evaluate(() => window.pointerEvents), ['mousedown', 'mouseup', 'click']);
});

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

  await t.test('Cả hai bộ quét loại iframe khác origin trong footer lồng nhau, vùng ẩn và tracker', async () => {
    const page = await browser.newPage();
    try {
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        const embedded = '<div class="survey-container"><form><input name="email"><input name="address"></form></div>';
        const html = url.pathname === '/landing'
          ? `<main><form><input name="firstname"></form>
              <div aria-hidden="true"><iframe name="hidden" src="https://child.test/form"></iframe></div>
              <iframe name="pixel" width="1" height="1" src="https://child.test/form"></iframe>
              <iframe name="tracker" src="https://stats.doubleclick.net/pixel"></iframe></main>
            <form><iframe name="outside" src="https://child.test/form"></iframe></form>
            <footer><iframe name="footer" src="https://child.test/nested"></iframe></footer>`
          : url.pathname === '/nested' ? '<iframe name="nested" src="https://other.test/form"></iframe>' : embedded;
        return route.fulfill({ contentType: 'text/html', body: html });
      });
      await page.goto('https://parent.test/landing');
      for (const name of ['hidden', 'pixel', 'tracker', 'outside', 'footer', 'nested']) {
        assert.equal(await inspectFormFrameOwner(page.frame({ name })), 'excluded', name);
      }
      for (const select of [selectGenericFormFrames, selectPageFormFrames]) {
        assert.deepEqual(await select(page), [page.mainFrame()]);
      }
    } finally {
      await page.close();
    }
  });

  await t.test('Không chọn CTA của trang cha trong khi chờ form nhúng, đọc lại sau khi iframe tải xong', async () => {
    const page = await browser.newPage();
    try {
      await page.route('https://child.test/**', route => route.fulfill({ contentType: 'text/html', body: '<main><form><input name="email"></form></main>' }));
      await page.setContent('<main><form><button>Tiếp tục</button></form><iframe name="survey"></iframe></main>');
      for (const select of [selectGenericFormFrames, selectPageFormFrames]) assert.deepEqual(await select(page), []);
      assert.equal(page._autofillWaitingForFormFrame, true);
      assert.equal((await executeAction(page, { action: 'click', selector: 'button' })).reason, 'scope_unavailable');
      assert.equal(await detectSmartFallbackAction(page), null);
      assert.equal(await inspectFormRepairState(page), null);
      assert.equal((await readVisiblePageState(page)).hasWork, false);
      const formLoaded = page.waitForEvent('framenavigated', frame => frame.url() === 'https://child.test/form');
      await page.locator('iframe').evaluate(element => { element.src = 'https://child.test/form'; });
      const child = await formLoaded;
      await child.locator('input').waitFor();
      for (const select of [selectGenericFormFrames, selectPageFormFrames]) assert.deepEqual(await select(page), [child]);
      assert.equal(page._autofillWaitingForFormFrame, false);
      await page.locator('iframe').evaluate(element => { element.parentElement.setAttribute('role', 'contentinfo'); });
      assert.equal((await executeAction(page, { action: 'fill', selector: 'input', value: 'outside' })).ok, false);
      assert.equal(await child.locator('input').inputValue(), '');
    } finally {
      await page.close();
    }
  });

  await t.test('Câu hỏi trung tâm vẫn được nhận khi iframe chỉ hiển thị văn bản đã tải xong', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent('<main><fieldset><legend>Did the status change?</legend><button>Yes</button><button>No</button></fieldset><iframe srcdoc="<p>Status information</p>"></iframe></main>');
      for (const select of [selectGenericFormFrames, selectPageFormFrames]) assert.deepEqual(await select(page), [page.mainFrame()]);
    } finally {
      await page.close();
    }
  });

  await t.test('Tab phụ chỉ xử lý iframe còn việc và dừng ngay khi iframe hết câu hỏi', async () => {
    const context = await browser.newContext();
    try {
      const root = await context.newPage();
      const popup = await context.newPage();
      const session = { mainPage: root };
      popup._autofillSession = session;
      await popup.route('https://popup.test/**', route => route.fulfill({ contentType: 'text/html',
        body: '<main><form><input name="email"><button type="button" onclick="window.parentClicked=true">Continue</button></form></main>' }));
      await popup.goto('https://popup.test/content');
      popup._activeAutofillFrame = popup.mainFrame();
      assert.equal(await humanClick(popup, popup.locator('button')), false);
      for (const select of [selectGenericFormFrames, selectPageFormFrames]) assert.deepEqual(await select(popup), []);
      for (const fill of [fillPageForms, fillOffer2615Forms]) {
        await fill(popup, { session, sessionRecord: { email: 'fixture@example.test' }, options: { autoSubmit: true } });
      }
      assert.equal(await popup.locator('input').inputValue(), '');
      assert.equal(await popup.evaluate(() => Boolean(window.parentClicked)), false);
      await popup.evaluate(() => {
        const iframe = document.createElement('iframe');
        iframe.srcdoc = '<main><form><label>Your name <input name="name"></label></form></main>';
        document.querySelector('main').appendChild(iframe);
      });
      await popup.frameLocator('iframe').locator('input').waitFor();
      const child = popup.frames()[1];
      for (const select of [selectGenericFormFrames, selectPageFormFrames]) assert.deepEqual(await select(popup), [child]);
      assert.equal((await executeAction(popup, { action: 'click', selector: 'button' })).ok, false);
      await child.setContent('<main><div class="survey-container"><h2>Completed</h2><form><input name="name" readonly value="Fixture"><button disabled>Done</button></form></div></main>');
      assert.equal((await readVisiblePageState(popup)).hasWork, false);
      for (const select of [selectGenericFormFrames, selectPageFormFrames]) assert.deepEqual(await select(popup), []);
      await popup.locator('iframe').evaluate(iframe => iframe.remove());
      assert.equal((await readVisiblePageState(popup)).hasWork, false);
      assert.equal((await executeAction(popup, { action: 'fill', selector: 'input', value: 'outside' })).ok, false);
      assert.equal(await popup.locator('input').inputValue(), '');
      popup._uxOriginTab = true;
      assert.deepEqual(await selectGenericFormFrames(popup), [popup.mainFrame()]);
    } finally {
      await context.close();
    }
  });

  await t.test('CTA rời và câu hỏi trong chân trang ARIA không mở quyền bấm hoặc điền', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent('<main><button id="next">Continue</button></main><div role="contentinfo"><form><input name="email"><button>Submit</button></form><h2>Which address?</h2><button>Yes</button><button>No</button></div>');
      for (const select of [selectGenericFormFrames, selectPageFormFrames]) assert.deepEqual(await select(page), []);
      assert.equal((await executeAction(page, { action: 'click', selector: '#next' })).ok, false);
      assert.equal((await executeAction(page, { action: 'fill', selector: 'input', value: 'outside' })).ok, false);
      assert.equal(await page.locator('input').inputValue(), '');
      assert.equal((await readVisiblePageState(page)).hasWork, false);
      assert.equal(await detectSmartFallbackAction(page), null);
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
