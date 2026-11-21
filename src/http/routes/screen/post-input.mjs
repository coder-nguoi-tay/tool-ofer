import { activeBrowsers } from '../../../browser/sessions.mjs';
import { copyHtmlToClipboard } from '../../../autofill/copy-html-to-clipboard.mjs';
import { executeFile } from '../../../runtime/constants/execute-file.mjs';
import { findScreenControlAtPoint, interactWithScreenSelect } from '../../../browser/screen/find-select-at-point.mjs';
import { sendBoundManualFieldInput, useFocusedManualTextField } from '../../../browser/screen/manual-text-field.mjs';
import { canPickLocalRecordField, getManualRecordFields } from '../../../browser/screen/manual-record-fields.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { screencastSessions } from '../../../runtime/constants/screencast-sessions.mjs';
import { renderBrowserMousePointer } from '../../../autofill/interaction/render-browser-mouse-pointer.mjs';

// Cùng một tab có thể chuyển từ stream sang ảnh dự phòng giữa lúc mở và chọn.
const pendingControlByPage = new WeakMap();

/**
 * Chuyển thao tác tay tới tab đang xem và kiểm tra mã lượt chờ khi người dùng báo đã xác minh.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @throws {Error} Khi thao tác trình duyệt hoặc ghi phản hồi HTTP thất bại ngoài các lỗi đã xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function handlePostScreenInput(request, response) {
  if (request.method === 'POST' && request.url.startsWith('/screen/input/')) {
    const slot = parseInt(request.url.split('/').pop(), 10);
    let commandJson;
    try {
      commandJson = await readRequestBody(request);
    } catch {
      respondWithJson(response, 400, { error: 'Thao tác Screen View không hợp lệ.' });
      return true;
    }
    let sc = screencastSessions.get(slot);
    let fallbackBrowser = null;
    let fallbackCdp = null;
    if (!sc || (!sc.page && !sc.cdpClient)) {
      const liveSession = [...activeBrowsers].find(s => !s.isClosed && (s.slot ?? s.tileIndex + 1) === slot);
      if (!liveSession || !liveSession.browser) {
        respondWithJson(response, 404, {
          error: 'stream not open'
        });
        return true;
      }
      const pages = liveSession.browser.pages ? liveSession.browser.pages().filter(p => !p.isClosed()) : [];
      const fallbackPage = (liveSession.mainPage && !liveSession.mainPage.isClosed()) ? liveSession.mainPage : pages[0];
      if (!fallbackPage) {
        respondWithJson(response, 404, {
          error: 'no active page'
        });
        return true;
      }
      fallbackBrowser = liveSession.browser;
      sc = { page: fallbackPage };
    }
    let body;
    try {
      body = JSON.parse(commandJson);
      if (!body || typeof body.type !== 'string') throw new Error();
    } catch {
      respondWithJson(response, 400, { error: 'Thao tác Screen View không hợp lệ.' });
      return true;
    }
    let finishPointerPress;
    let picked = null;
    try {
      if (body.type === 'dialog') {
        const dialogPage = sc.page;
        const pending = dialogPage?._manualFormDialog;
        if (!pending || pending.answering || body.dialogId !== pending.id || typeof body.accept !== 'boolean') {
          respondWithJson(response, 409, { error: 'Hộp thoại đã thay đổi.' });
          return true;
        }
        pending.answering = true;
        try {
          if (body.accept) await pending.dialog.accept(String(body.promptText ?? ''));
          else await pending.dialog.dismiss();
          if (dialogPage._manualFormDialog === pending) delete dialogPage._manualFormDialog;
        } finally {
          delete pending.answering;
        }
        respondWithJson(response, 200, { ok: true });
        return true;
      }
      if (body.type === 'confirmManualCaptcha') {
        const page = sc.page;
        const requestId = body.manualCaptchaRequestId;
        if (!requestId || page?._manualCaptchaPending !== true || page._manualCaptchaRequestId !== requestId || page.isClosed()) {
          respondWithJson(response, 409, { error: 'Tab hoặc lượt xác minh CAPTCHA đã thay đổi.' });
          return true;
        }
        try {
          if (await page.confirmManualCaptcha?.(requestId) === true) {
            respondWithJson(response, 200, { ok: true });
            return true;
          }
        } catch { /* Tab có thể chuyển trang khi kiểm tra lại widget. */ }
        respondWithJson(response, 409, { error: 'Chưa xác nhận được CAPTCHA đã hoàn tất. Tab vẫn tạm dừng.' });
        return true;
      }
      if ((sc.screenSourceId || body.screenSourceId) && body.screenSourceId !== sc.screenSourceId) {
        respondWithJson(response, 409, { error: 'Ảnh đang xem thuộc tab cũ. Đợi khung hình mới rồi thao tác lại.' });
        return true;
      }
      // Giữ đúng cặp tab/CDP đã kiểm tra khi người xem khác chuyển nguồn trong lúc await.
      sc = { ...sc };
      const localRecordPicker = Boolean(body.screenSourceId) && canPickLocalRecordField(request);
      if (body.type === 'insertRecordField') {
        if (!localRecordPicker) {
          respondWithJson(response, 403, { error: 'Chọn cột hồ sơ từ giao diện trên máy chạy app.' });
          return true;
        }
        const pending = pendingControlByPage.get(sc.page);
        const control = await pending;
        const opened = control?.recordPicker;
        const currentStream = screencastSessions.get(slot);
        if (!opened || !body.fieldId || control.input?.fieldId !== body.fieldId ||
            pending !== pendingControlByPage.get(sc.page) || currentStream?.page !== sc.page ||
            currentStream.screenSourceId !== body.screenSourceId || sc.page.isClosed()) {
          respondWithJson(response, 409, { error: 'Ô nhập đã thay đổi. Hãy mở lại ô.' });
          return true;
        }
        const session = [...activeBrowsers].find(item => !item.isClosed && (item.slot ?? item.tileIndex + 1) === slot);
        const current = getManualRecordFields(sc.page, session);
        const value = opened.values.get(body.recordField);
        if (value === undefined || opened.record !== current.record || value !== current.values.get(body.recordField)) {
          respondWithJson(response, 409, { error: 'Cột hoặc hồ sơ đã đổi. Hãy mở lại ô.' });
          return true;
        }
        delete control.recordPicker;
        const accepted = await sendBoundManualFieldInput(control, { type: 'insertText', fieldId: body.fieldId, text: value });
        if (accepted !== true) {
          respondWithJson(response, accepted === null ? 409 : 422, {
            error: accepted === null ? 'Ô nhập đã thay đổi. Hãy mở lại ô.' : 'Form chưa xác nhận giá trị. Kiểm tra nội dung ô trước khi chèn lại.',
          });
          return true;
        }
        respondWithJson(response, 200, { ok: true });
        return true;
      }
      // mouseup phải chờ mousedown trên cùng tab, kể cả khi mở CDP dự phòng chậm.
      let pendingPress;
      if (sc.page && (body.type === 'mousedown' || body.type === 'click')) {
        pendingPress = new Promise(resolve => { finishPointerPress = resolve; });
        pendingControlByPage.set(sc.page, pendingPress);
      }
      if (fallbackBrowser) {
        fallbackCdp = await fallbackBrowser.newCDPSession(sc.page).catch(() => null);
        if (!fallbackCdp) {
          respondWithJson(response, 500, { error: 'cannot open cdp session' });
          return true;
        }
        sc.cdpClient = fallbackCdp;
      }
      // Người dùng đang thao tác tay trong Screen View: tính là hoạt động, không để F5 tự động đè lên.
      if (sc.page && body.type !== 'mousemove') sc.page._uxManualInputAt = Date.now();
      const {
        cdpClient
      } = sc;

      // Xử lý sự kiện chuột & cuộn bánh xe (scale toạ độ theo viewport)
      if (body.type === 'click' || body.type === 'mousedown' || body.type === 'mouseup' || body.type === 'mousemove' || body.type === 'wheel') {
        const liveViewport = sc.page && !sc.page.isClosed()
          ? await sc.page.evaluate(() => ({
            width: Math.round(window.visualViewport?.width || window.innerWidth || 0),
            height: Math.round(window.visualViewport?.height || window.innerHeight || 0)
          })).catch(() => null)
          : null;
        const pageViewport = typeof sc.page?.viewportSize === 'function' ? sc.page.viewportSize() : null;
        // Metadata của screencast có thể còn thuộc tab trước trong khoảng thời gian tab mới
        // chưa phát frame đầu tiên. Viewport hiện tại của page mới là hệ quy chiếu đúng cho
        // elementFromPoint, đặc biệt với Obscura khi mỗi profile có kích thước thiết bị riêng.
        const devW = liveViewport?.width || sc.deviceWidth || pageViewport?.width || 1280;
        const devH = liveViewport?.height || sc.deviceHeight || pageViewport?.height || 800;
        let targetX = body.x ?? 0;
        let targetY = body.y ?? 0;
        if (body.clientWidth && devW) {
          targetX = Math.round(targetX * (devW / body.clientWidth));
        }
        if (body.clientHeight && devH) {
          targetY = Math.round(targetY * (devH / body.clientHeight));
        }
        if (sc.page && !sc.page.isClosed()) {
          void renderBrowserMousePointer(sc.page, targetX, targetY, body.type === 'mousedown' || body.type === 'click');
        }
        if (pendingPress && (body.button || 'left') === 'left' && !sc.page.isClosed()) {
          picked = await findScreenControlAtPoint(sc.page, targetX, targetY, body.type === 'click' || localRecordPicker).catch(() => null);
          if (picked?.options) {
            if (pendingPress !== pendingControlByPage.get(sc.page)) {
              picked = null;
              respondWithJson(response, 409, { error: 'Ô chọn đã thay đổi' });
              return true;
            }
            respondWithJson(response, 200, {
              ok: true,
              select: {
                uid: picked.uid,
                options: picked.options,
                selectedIndex: picked.selectedIndex
              }
            });
            return true;
          }
        }
        if (body.type === 'click') {
          await cdpClient.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: targetX,
            y: targetY,
            button: body.button || 'left',
            clickCount: body.clickCount || 1,
            modifiers: body.modifiers || 0
          });
          await new Promise(r => setTimeout(r, 35));
          await cdpClient.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: targetX,
            y: targetY,
            button: body.button || 'left',
            clickCount: body.clickCount || 1,
            modifiers: body.modifiers || 0
          });
          const clickedSession = [...activeBrowsers].find(item => (item.slot ?? (item.tileIndex ?? -1) + 1) === slot);
          clickedSession?.addBrowserLog?.({
            type: 'click',
            source: 'manual', x: targetX, y: targetY,
            detail: `Click tay qua Screen View (${body.button || 'left'}) tại (${targetX}, ${targetY})`
          }, sc.page);
        } else if (body.type === 'mousedown') {
          await cdpClient.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: targetX,
            y: targetY,
            button: body.button || 'left',
            clickCount: body.clickCount || 1,
            modifiers: body.modifiers || 0
          });
        } else if (body.type === 'mouseup') {
          const pendingSelect = pendingControlByPage.get(sc.page);
          const selectedControl = pendingSelect ? await pendingSelect : null;
          if (selectedControl?.options) {
            respondWithJson(response, 200, {
              ok: true
            });
            return true;
          }
          await cdpClient.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: targetX,
            y: targetY,
            button: body.button || 'left',
            clickCount: body.clickCount || 1,
            modifiers: body.modifiers || 0
          });
          const clickedSession = [...activeBrowsers].find(item => (item.slot ?? (item.tileIndex ?? -1) + 1) === slot);
          clickedSession?.addBrowserLog?.({
            type: 'click',
            source: 'manual', x: targetX, y: targetY,
            detail: `Click tay qua Screen View (${body.button || 'left'}) tại (${targetX}, ${targetY})`
          }, sc.page);
        } else if (body.type === 'mousemove') {
          await cdpClient.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: targetX,
            y: targetY,
            modifiers: body.modifiers || 0
          });
        } else if (body.type === 'wheel') {
          const deltaX = Math.round(body.deltaX || 0);
          const deltaY = Math.round(body.deltaY || 0);
          try {
            await cdpClient.send('Input.dispatchMouseEvent', {
              type: 'mouseWheel',
              x: targetX,
              y: targetY,
              deltaX,
              deltaY,
              modifiers: body.modifiers || 0
            });
          } catch {
            const scrolled = !body.modifiers && sc.page && !sc.page.isClosed() && await sc.page.evaluate(offset => {
              window.scrollBy(offset);
              return true;
            }, { top: deltaY, left: deltaX, behavior: 'auto' }).catch(() => false);
            if (!scrolled) {
              respondWithJson(response, 502, { error: 'Trình duyệt chưa nhận được thao tác cuộn.' });
              return true;
            }
          }
        }
        if (body.type === 'click' || body.type === 'mousedown' && localRecordPicker && picked?.input) {
          const input = picked?.input;
          const focused = input && await picked.frame.evaluate(useFocusedManualTextField, {
            fieldId: input.fieldId, probe: true,
          }).catch(() => false);
          const activeInput = focused && pendingControlByPage.get(sc.page) === pendingPress ? input : null;
          if (activeInput && localRecordPicker) {
            const session = [...activeBrowsers].find(item => !item.isClosed && (item.slot ?? item.tileIndex + 1) === slot);
            picked.recordPicker = getManualRecordFields(sc.page, session);
            activeInput.recordFields = [...picked.recordPicker.values.keys()];
          }
          respondWithJson(response, 200, { ok: true, input: activeInput });
          return true;
        }
      } else if (body.type === 'reload') {
        if (sc.page && !sc.page.isClosed()) {
          await sc.page.reload({
            waitUntil: 'domcontentloaded',
            timeout: 20000
          }).catch(() => {});
        }
      } else if (body.type === 'back') {
        if (sc.page && !sc.page.isClosed()) {
          await sc.page.goBack({
            waitUntil: 'domcontentloaded',
            timeout: 15000
          }).catch(() => {});
        }
      } else if (body.type === 'forward') {
        if (sc.page && !sc.page.isClosed()) {
          await sc.page.goForward({
            waitUntil: 'domcontentloaded',
            timeout: 15000
          }).catch(() => {});
        }
      } else if (body.type === 'scrollPage') {
        if (sc.page && !sc.page.isClosed()) {
          const dir = body.direction || 'down';
          await sc.page.evaluate(d => {
            if (d === 'top') window.scrollTo({
              top: 0,
              behavior: 'smooth'
            });else if (d === 'bottom') window.scrollTo({
              top: document.body.scrollHeight,
              behavior: 'smooth'
            });else if (d === 'up') window.scrollBy({
              top: -window.innerHeight * 0.75,
              behavior: 'smooth'
            });else window.scrollBy({
              top: window.innerHeight * 0.75,
              behavior: 'smooth'
            });
          }, dir).catch(() => {});
        }
      } else if (body.type === 'select') {
        // Người dùng chọn một dòng trong danh sách select Screen View vừa hiện.
        const pendingSelect = pendingControlByPage.get(sc.page);
        const pick = await pendingSelect;
        if (!pick?.options || pick.consumed || pendingSelect !== pendingControlByPage.get(sc.page) || body.uid !== pick.uid) {
          respondWithJson(response, 409, {
            error: 'select không còn'
          });
          return true;
        }
        const index = typeof body.index === 'string' && body.index.trim() !== '' ? Number(body.index) : body.index;
        const choice = pick.options[index];
        if (!Number.isInteger(index) || !choice || choice.disabled) {
          respondWithJson(response, 400, { error: 'Mục đã chọn không khả dụng' });
          return true;
        }
        const selectControl = pick.frame.locator(`select[data-ux-screen-select="${pick.uid}"]`);
        const applied = await selectControl.evaluate(interactWithScreenSelect, { uid: pick.uid, index }, { timeout: 1000 }).catch(() => false);
        if (applied !== true) {
          respondWithJson(response, 409, { error: 'Danh sách đã thay đổi, hãy mở lại ô chọn' });
          return true;
        }
        pick.consumed = true;
        if (pendingControlByPage.get(sc.page) === pendingSelect) {
          pendingControlByPage.delete(sc.page);
        }
        const clickedSession = [...activeBrowsers].find(item => (item.slot ?? (item.tileIndex ?? -1) + 1) === slot);
        clickedSession?.addBrowserLog?.({
          type: 'click',
          source: 'manual',
          detail: `Chọn tay qua Screen View: ${pick.options[body.index]?.label ?? body.index}`
        }, sc.page);
      } else if (body.type === 'shortcut') {
        // Phím tắt hệ thống: Cmd/Ctrl + A/X/C/V → thực hiện copy/cut/paste/select-all tự nhiên
        // qua CDP Input.dispatchKeyEvent với commands (Chrome DevTools Protocol).
        if (cdpClient) {
          const commandMap = {
            copy: 'copy',
            cut: 'cut',
            paste: 'paste',
            selectAll: 'selectAll'
          };
          const command = commandMap[body.command];
          if (command) {
            if (command === 'paste') {
              // Văn bản dán được chèn đúng một lần qua page.keyboard.insertText bên dưới; không gửi CDP ở đây.
            } else {
              await cdpClient.send('Input.dispatchKeyEvent', {
                type: 'keyDown',
                key: body.key || (command === 'selectAll' ? 'a' : 'c'),
                code: body.code || '',
                modifiers: body.modifiers || 0,
                commands: [command]
              }).catch(() => {});
              await cdpClient.send('Input.dispatchKeyEvent', {
                type: 'keyUp',
                key: body.key || (command === 'selectAll' ? 'a' : 'c'),
                code: body.code || '',
                modifiers: body.modifiers || 0
              }).catch(() => {});
            }
          }
        }
        // Clipboard đi qua macOS (pbcopy/pbpaste) thay vì clipboard của trình duyệt: Chrome headless không nối với
        // clipboard hệ thống, còn WKWebView của app không phát sự kiện paste trên canvas → Cmd+C/V không chạy.
        if (sc.page && !sc.page.isClosed() && (body.command === 'copy' || body.command === 'cut')) {
          const selected = await sc.page.evaluate(() => {
            const el = document.activeElement;
            if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName) && typeof el.selectionStart === 'number') {
              return el.value.slice(el.selectionStart, el.selectionEnd);
            }
            return String(window.getSelection() || '');
          }).catch(() => '');
          if (selected) {
            await copyHtmlToClipboard(selected);
          }
        }
        if (sc.page && !sc.page.isClosed() && body.command === 'paste') {
          const text = body.text || (await executeFile('pbpaste').catch(() => ({
            stdout: ''
          }))).stdout;
          if (text) await sc.page.keyboard.insertText(text).catch(() => {});
        }
        respondWithJson(response, 200, {
          ok: true
        });
        return true;
      } else if (body.type === 'pickSurveyOption') {
        // Tự động tìm và chọn lựa chọn khảo sát trên trang: 0 (option 1), 1 (option 2), hoặc 'random'
        if (sc.page && !sc.page.isClosed()) {
          const choice = body.choice ?? 'random';
          const result = await sc.page.evaluate((optChoice) => {
            const isVisible = (el) => {
              if (!el || el.disabled) return false;
              const s = window.getComputedStyle ? window.getComputedStyle(el) : null;
              if (s && (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0')) return false;
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            };
            const options = Array.from(document.querySelectorAll(
              'input[type="radio"], [data-ux-choice-id], button.btn-option, a.btn-option, [data-btn-option], [class*="option"], [class*="choice"], [class*="answer"], .survey-option, label.radio, label:has(input[type="radio"]), [role="radio"]'
            )).filter(isVisible);

            if (options.length === 0) return { ok: false, message: 'Không tìm thấy lựa chọn nào trên màn hình' };

            let targetIdx = 0;
            if (optChoice === 'random') {
              const max = Math.min(2, options.length);
              targetIdx = Math.floor(Math.random() * max);
            } else {
              targetIdx = Math.min(Number(optChoice), options.length - 1);
            }

            const target = options[targetIdx];
            if (target) {
              target.scrollIntoView({ behavior: 'auto', block: 'center' });
              target.click();
              const label = (target.textContent || target.value || target.getAttribute('aria-label') || `Lựa chọn ${targetIdx + 1}`).trim();
              return { ok: true, choice: targetIdx + 1, label: label.length > 25 ? label.slice(0, 22) + '...' : label };
            }
            return { ok: false, message: 'Không thể chọn mục' };
          }, choice).catch(err => ({ ok: false, message: err.message }));

          const clickedSession = [...activeBrowsers].find(item => (item.slot ?? (item.tileIndex ?? -1) + 1) === slot);
          if (result?.ok) {
            clickedSession?.addBrowserLog?.({
              type: 'click',
              source: 'manual',
              detail: `Chọn kết quả qua Mini App: Option ${result.choice} ("${result.label}")`
            }, sc.page);
          }
          respondWithJson(response, 200, result);
          return true;
        }
      } else if (body.type === 'clickNext' || body.type === 'submitForm') {
        // Tự động tìm và bấm nút Submit / Next / Continue trên trang
        if (sc.page && !sc.page.isClosed()) {
          const result = await sc.page.evaluate(() => {
            const isVisible = (el) => {
              if (!el || el.disabled) return false;
              const s = window.getComputedStyle ? window.getComputedStyle(el) : null;
              if (s && (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0')) return false;
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            };
            const buttons = Array.from(document.querySelectorAll(
              'button[type="submit"], input[type="submit"], button:not([type]), [role="button"], a.btn, a.button, a.cta-button, .btn-submit, .btn-next, .btn-continue, button, a'
            )).filter(isVisible);

            for (const btn of buttons) {
              const txt = (btn.textContent || btn.value || '').trim();
              if (/^(continue|submit|next|tiếp tục|hoàn thành|xác nhận|agree|get started|see my results|claim)/i.test(txt) ||
                  /submit|continue|next/i.test(btn.id || btn.className)) {
                btn.scrollIntoView({ behavior: 'auto', block: 'center' });
                btn.click();
                const label = txt.length > 25 ? txt.slice(0, 22) + '...' : (txt || 'Submit / Next');
                return { ok: true, label };
              }
            }
            return { ok: false, message: 'Không tìm thấy nút Next/Submit phù hợp' };
          }).catch(err => ({ ok: false, message: err.message }));

          const clickedSession = [...activeBrowsers].find(item => (item.slot ?? (item.tileIndex ?? -1) + 1) === slot);
          if (result?.ok) {
            clickedSession?.addBrowserLog?.({
              type: 'click',
              source: 'manual',
              detail: `Bấm nút Next/Submit qua Mini App: "${result.label}"`
            }, sc.page);
          }
          respondWithJson(response, 200, result);
          return true;
        }
      } else if (body.type === 'press' || body.type === 'insertText') {
        const typing = body.type === 'insertText';
        const value = typing ? body.text : body.key;
        if (typeof value !== 'string' || !value) {
          respondWithJson(response, 400, { error: typing ? 'Cần nhập văn bản.' : 'Cần chọn phím để gửi.' });
          return true;
        }
        if (sc.page?.isClosed() || (!sc.page && (!typing || !cdpClient))) {
          respondWithJson(response, 409, { error: 'Tab chưa sẵn sàng nhận dữ liệu.' });
          return true;
        }
        try {
          if (Object.hasOwn(body, 'fieldId')) {
            const pending = pendingControlByPage.get(sc.page);
            const control = await pending;
            const accepted = pending === pendingControlByPage.get(sc.page)
              ? await sendBoundManualFieldInput(control, body) : null;
            if (accepted !== true) {
              respondWithJson(response, accepted === null ? 409 : 422, {
                error: accepted === null ? 'Ô nhập đã thay đổi. Hãy mở lại ô.' : 'Ô nhập từ chối thao tác.',
              });
              return true;
            }
          } else if (!typing) await sc.page.keyboard.press(value);
          else if (sc.page) await sc.page.keyboard.insertText(value);
          else await cdpClient.send('Input.insertText', { text: value });
        } catch {
          respondWithJson(response, 502, { error: 'Trình duyệt chưa xác nhận thao tác nhập liệu.' });
          return true;
        }
      } else if (body.type === 'key' || body.type === 'keydown' || body.type === 'char') {
        // Xử lý sự kiện bàn phím thông minh qua Playwright page.keyboard (trực tiếp và không nghẽn CDP)
        if (sc.page && !sc.page.isClosed()) {
          if (body.text) {
            await sc.page.keyboard.insertText(body.text).catch(() => {});
          } else if (body.key === 'Backspace' || body.key === 'Delete' || body.key === 'Enter' || body.key === 'Tab' || body.key === 'Escape' || body.key?.startsWith('Arrow')) {
            await sc.page.keyboard.press(body.key).catch(() => {});
          } else if (body.key && body.key.length === 1 && !body.modifiers) {
            await sc.page.keyboard.insertText(body.key).catch(() => {});
          } else if (body.key) {
            let chord = '';
            if (body.modifiers) {
              if (body.modifiers & 2) chord += 'Control+';
              if (body.modifiers & 4) chord += 'Meta+';
              if (body.modifiers & 1) chord += 'Alt+';
              if (body.modifiers & 8) chord += 'Shift+';
            }
            chord += body.key;
            await sc.page.keyboard.press(chord).catch(async () => {
              if (cdpClient) {
                await cdpClient.send('Input.dispatchKeyEvent', {
                  type: 'rawKeyDown',
                  key: body.key,
                  code: body.code || '',
                  modifiers: body.modifiers || 0
                }).catch(() => {});
                await cdpClient.send('Input.dispatchKeyEvent', {
                  type: 'keyUp',
                  key: body.key,
                  code: body.code || '',
                  modifiers: body.modifiers || 0
                }).catch(() => {});
              }
            });
          }
        } else if (cdpClient) {
          // Fallback trực tiếp qua CDP nếu page object không khả dụng
          if (body.text) {
            await cdpClient.send('Input.dispatchKeyEvent', {
              type: 'char',
              text: body.text
            }).catch(() => {});
          } else {
            await cdpClient.send('Input.dispatchKeyEvent', {
              type: 'keyDown',
              key: body.key,
              code: body.code || '',
              modifiers: body.modifiers || 0
            }).catch(() => {});
            await cdpClient.send('Input.dispatchKeyEvent', {
              type: 'keyUp',
              key: body.key,
              code: body.code || '',
              modifiers: body.modifiers || 0
            }).catch(() => {});
          }
        }
      }
      respondWithJson(response, 200, {
        ok: true
      });
    } catch (err) {
      respondWithJson(response, 500, {
        error: err.message
      });
    } finally {
      finishPointerPress?.(picked);
      if (fallbackCdp) await fallbackCdp.detach().catch(() => {});
    }
    return true;
  }
  return false;
}
