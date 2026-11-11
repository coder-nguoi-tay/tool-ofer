import { activeBrowsers } from '../../../browser/sessions.mjs';
import { execFile } from 'node:child_process';
import { executeFile } from '../../../runtime/constants/execute-file.mjs';
import { findSelectAtPoint } from "../../../browser/screen/find-select-at-point.mjs";
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { screencastSessions } from '../../../runtime/constants/screencast-sessions.mjs';

/**
 * Xử lý API screen-input.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostScreenInput(request, response) {
  if (request.method === 'POST' && request.url.startsWith('/screen/input/')) {
    const slot = parseInt(request.url.split('/').pop(), 10);
    const sc = screencastSessions.get(slot);
    if (!sc) {
      respondWithJson(response, 404, {
        error: 'stream not open'
      });
      return true;
    }
    try {
      const body = JSON.parse(await readRequestBody(request));
      const {
        cdpClient
      } = sc;

      // Xử lý sự kiện chuột & cuộn bánh xe (scale toạ độ theo viewport)
      if (body.type === 'click' || body.type === 'mousedown' || body.type === 'mouseup' || body.type === 'mousemove' || body.type === 'wheel') {
        const devW = sc.deviceWidth || (typeof sc.page?.viewportSize === 'function' ? sc.page.viewportSize()?.width : 0) || 1280;
        const devH = sc.deviceHeight || (typeof sc.page?.viewportSize === 'function' ? sc.page.viewportSize()?.height : 0) || 800;
        let targetX = body.x ?? 0;
        let targetY = body.y ?? 0;
        if (body.clientWidth && devW) {
          targetX = Math.round(targetX * (devW / body.clientWidth));
        }
        if (body.clientHeight && devH) {
          targetY = Math.round(targetY * (devH / body.clientHeight));
        }
        if (body.type === 'click') {
          // Thao tác click nguyên tử: kiểm tra dropdown <select>, kiểm tra input, và nhấn/nhả chuột
          sc.selectPick = null;
          const picked = (body.button || 'left') === 'left' && sc.page && !sc.page.isClosed() ? await findSelectAtPoint(sc.page, targetX, targetY).catch(() => null) : null;
          if (picked) {
            sc.selectPick = picked;
            respondWithJson(response, 200, {
              ok: true,
              select: {
                options: picked.options,
                selectedIndex: picked.selectedIndex
              }
            });
            return true;
          }
          let inputInfo = null;
          if (sc.page && !sc.page.isClosed()) {
            inputInfo = await sc.page.evaluate(([cx, cy]) => {
              const el = document.elementFromPoint(cx, cy);
              if (!el) return null;
              const inp = el.closest('input, textarea, [contenteditable="true"]');
              if (!inp) return null;
              const tag = inp.tagName.toLowerCase();
              const type = (inp.getAttribute('type') || (tag === 'textarea' ? 'textarea' : 'text')).toLowerCase();
              return {
                tag,
                type,
                value: inp.value || inp.innerText || '',
                placeholder: inp.getAttribute('placeholder') || inp.getAttribute('aria-label') || inp.name || '',
                name: inp.name || inp.id || '',
                isTextLike: /^(text|email|tel|number|password|search|url|textarea)$/.test(type) || inp.isContentEditable
              };
            }, [targetX, targetY]).catch(() => null);
          }
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
          respondWithJson(response, 200, {
            ok: true,
            input: inputInfo
          });
          return true;
        } else if (body.type === 'mousedown') {
          // Click vào ô select: không gửi click (popup native không hiện trong screencast) mà trả danh sách
          // lựa chọn để Screen View tự vẽ. mouseup chờ bước này xong để giữ đúng thứ tự nhấn/nhả.
          sc.selectPick = null;
          sc.pointerCheck = (body.button || 'left') === 'left' && sc.page && !sc.page.isClosed() ? findSelectAtPoint(sc.page, targetX, targetY).catch(() => null) : Promise.resolve(null);
          const picked = await sc.pointerCheck;
          if (picked) {
            sc.selectPick = picked;
            respondWithJson(response, 200, {
              ok: true,
              select: {
                options: picked.options,
                selectedIndex: picked.selectedIndex
              }
            });
            return true;
          }
          await cdpClient.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: targetX,
            y: targetY,
            button: body.button || 'left',
            clickCount: body.clickCount || 1,
            modifiers: body.modifiers || 0
          });
        } else if (body.type === 'mouseup') {
          if (await sc.pointerCheck) {
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
          } catch (e) {
            if (sc.page && !sc.page.isClosed()) {
              await sc.page.evaluate((dy, dx) => {
                window.scrollBy({
                  top: dy,
                  left: dx,
                  behavior: 'auto'
                });
              }, deltaY, deltaX).catch(() => {});
            }
          }
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
        const pick = sc.selectPick;
        if (!pick) {
          respondWithJson(response, 409, {
            error: 'select không còn'
          });
          return true;
        }
        await pick.frame.locator(`select[data-ux-screen-select="${pick.uid}"]`).selectOption({
          index: Number(body.index)
        }, {
          timeout: 3000
        });
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
            await new Promise(resolve => {
              const child = execFile('pbcopy', resolve);
              child.stdin.end(selected);
            });
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
      } else if (body.type === 'press') {
        // Gõ phím đơn lẻ (Enter, Tab, Backspace...) không bị duplicate down + up
        if (sc.page && !sc.page.isClosed() && body.key) {
          await sc.page.keyboard.press(body.key).catch(() => {});
        }
        respondWithJson(response, 200, { ok: true });
        return true;
      } else if (body.type === 'key' || body.type === 'keydown' || body.type === 'char' || body.type === 'insertText') {
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
    }
    return true;
  }
  return false;
}
