import { protectConfirmedLeadSession } from '../leads/actions/protect-confirmed-lead-session.mjs';
import { buildVars } from './build-vars.mjs';
import { delay } from './delay.mjs';
import { executeSmartClick } from './execute-smart-click.mjs';
import { handleGenderSelect } from './handle-gender-select.mjs';
import { handleTrySelectOption } from './handle-try-select-option.mjs';
import { handleTrySelectRadioByText } from './handle-try-select-radio-by-text.mjs';
import { handleTrySelectState } from './handle-try-select-state.mjs';
import { handleTypeWithDelay } from './handle-type-with-delay.mjs';
import { parseDelayMs } from './parse-delay-ms.mjs';
import { randInt } from './rand-int.mjs';
import { resolveSmartLocator } from './resolve-smart-locator.mjs';
import { selectByIndex } from './select-by-index.mjs';
import { selectByText } from './select-by-text.mjs';
import { selectByValue } from './select-by-value.mjs';
import { selectRandom } from './select-random.mjs';
import { solveReCaptcha } from '../../captcha.mjs';
import { subAsync } from './sub-async.mjs';

/**
 * Thực thi danh sách bước script trên trang Playwright.
 *
 * @param {import('playwright').Page} page
 * @param {Array<{cmd:string,arg:string}>} steps
 * @param {object} record Bản ghi autofill
 * @param {{captchaApiKey?: string, logger?: function, scriptDir?: string, session?: object}} opts
 * @return {Promise<void>} Kết quả xử lý run script.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function runScript(page, steps, record, {
  captchaApiKey = '',
  logger = null,
  scriptDir = '',
  session = null
} = {}) {
  const vars = buildVars(record ?? {});
  const sub = async text => subAsync(text, vars, scriptDir);
  let currentFrame = page;
  for (const {
    cmd,
    arg
  } of steps) {
    const val = await sub(arg);
    logger?.({
      type: 'script_step',
      detail: `{${cmd}}${val ? '=' + val.slice(0, 80) : ''}`
    });
    try {
      switch (cmd) {
        // ── No-op / Config Markers ───────────────────────────────────────
        case 'Note':
        case 'EmailConfig':
        case 'InfoConfig':
        case 'CheckTenOffer':
        case 'LoadTime':
        case 'ByPassReCaptchaCallback':
        case 'LoginGmail':
          break;

        // ── Chờ đợi ───────────────────────────────────────────────────────
        case 'Delay':
          await delay(parseDelayMs(val));
          break;
        case 'CheckPageLoaded':
        case 'CheckPageLoadedScript':
          await page.waitForLoadState('domcontentloaded', {
            timeout: 30000
          }).catch(() => {});
          await page.evaluate(() => typeof jQuery !== 'undefined' ? jQuery.active === 0 : true).catch(() => {});
          break;
        case 'DisplayEndXpath':
          if (val) await page.waitForSelector(`xpath=${val}`, {
            timeout: 15000
          }).catch(() => {});
          break;
        case 'Check':
          {
            const [checkSelector, checkTimeout] = val.split('|');
            const ms = (parseFloat(checkTimeout) || 10) * 1000;
            if (checkSelector) {
              const loc = await resolveSmartLocator(page, currentFrame, checkSelector.trim());
              await loc.waitFor({
                state: 'visible',
                timeout: ms
              }).catch(() => {});
            }
            break;
          }
        case 'CheckNoXpath':
          {
            const [noXpath, noTimeout] = val.split('|');
            const ms = (parseFloat(noTimeout) || 10) * 1000;
            if (noXpath) {
              await page.waitForSelector(`xpath=${noXpath.trim()}`, {
                state: 'hidden',
                timeout: ms
              }).catch(() => {});
            }
            break;
          }

        // ── Điều hướng & Cửa sổ ──────────────────────────────────────────
        case 'Navigate':
        case 'Url':
          if (val) await page.goto(val, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          }).catch(() => {});
          break;
        case 'Newtab':
          if (val) {
            const newPage = await page.context().newPage();
            await newPage.goto(val, {
              waitUntil: 'domcontentloaded',
              timeout: 30000
            }).catch(() => {});
          }
          break;
        case 'Close':
          if (session && protectConfirmedLeadSession(session)) break;
          page._uxClosedByApp = 'script đóng tab';
          await page.close().catch(() => {});
          break;
        case 'SwitchToWindowHandles':
          {
            const idx = parseInt(val, 10) || 0;
            const pages = page.context().pages();
            if (pages[idx] && !pages[idx].isClosed()) await pages[idx].bringToFront().catch(() => {});
            break;
          }
        case 'SwitchToWindowHandlesLast':
          {
            const allPages = page.context().pages();
            const last = allPages[allPages.length - 1];
            if (last && !last.isClosed()) await last.bringToFront().catch(() => {});
            break;
          }
        case 'ClearCookie':
          await page.context().clearCookies().catch(() => {});
          break;

        // ── Điền Form — by Name ──────────────────────────────────────────
        case 'SendByName':
          {
            const [fName, fVal, fDelay] = val.split('|');
            const fieldVal = fVal != null ? await sub(fVal.trim()) : '';
            if (!fName?.trim()) break;
            const loc = currentFrame.locator(`[name="${fName.trim()}"]`).first();
            await handleTypeWithDelay(loc, fieldVal, fDelay);
            break;
          }

        // ── Điền Form — by ID ─────────────────────────────────────────────
        case 'SendById':
          {
            const [fId, fVal, fDelay] = val.split('|');
            const fieldVal = fVal != null ? await sub(fVal.trim()) : '';
            if (!fId?.trim()) break;
            const loc = currentFrame.locator(`#${fId.trim()}`).first();
            await handleTypeWithDelay(loc, fieldVal, fDelay);
            break;
          }

        // ── Điền Form — by Class ──────────────────────────────────────────
        case 'SendByClass':
          {
            const parts = val.split('|');
            let cls, idx, fieldVal, fDelay;
            if (parts.length >= 4) {
              [cls, idx, fieldVal, fDelay] = parts;
            } else if (parts.length === 3 && !isNaN(Number(parts[1]))) {
              [cls, idx, fieldVal] = parts;
            } else {
              [cls, fieldVal, fDelay] = parts;
              idx = '0';
            }
            fieldVal = fieldVal != null ? await sub(fieldVal.trim()) : '';
            if (!cls?.trim()) break;
            const loc = currentFrame.locator(`.${cls.trim()}`).nth(Number(idx) || 0);
            await handleTypeWithDelay(loc, fieldVal, fDelay);
            break;
          }

        // ── Điền Form — by XPath ──────────────────────────────────────────
        case 'SendByXpath':
          {
            const parts = val.split('|');
            const xp = parts[0]?.trim();
            const idx = isNaN(Number(parts[1])) ? 0 : Number(parts[1]);
            const fVal = parts[2] != null ? await sub(parts[2].trim()) : '';
            const fDelay = parts[3] ?? 0;
            if (!xp) break;
            const loc = currentFrame.locator(`xpath=${xp}`).nth(idx);
            await handleTypeWithDelay(loc, fVal, fDelay);
            break;
          }
        case 'SendKeyEnterByXpath':
          {
            const xp = val.trim();
            if (!xp) break;
            const loc = currentFrame.locator(`xpath=${xp}`).first();
            await loc.press('Enter', {
              timeout: 5000
            }).catch(() => {});
            break;
          }

        // ── Click Thông Minh & Click Chuẩn ───────────────────────────────
        case 'SmartClick':
          {
            if (!val) break;
            // Syntax: {SmartClick}=Selector|Index|Type
            const parts = val.split('|');
            const selectorInput = parts[0]?.trim();
            const oneBasedIndex = parts[1] != null && !isNaN(Number(parts[1])) ? Number(parts[1]) : 1;
            const clickType = parts[2] != null && !isNaN(Number(parts[2])) ? Number(parts[2]) : 1;
            if (!selectorInput) break;
            const loc = await resolveSmartLocator(page, currentFrame, selectorInput, oneBasedIndex);
            await executeSmartClick(page, loc, clickType);
            break;
          }
        case 'ClickXpathActions':
        case 'ClickXpath':
          {
            if (!val) break;
            const parts = val.split('|');
            const xp = parts[0]?.trim();
            const idx = parts[1] != null && !isNaN(Number(parts[1])) ? Number(parts[1]) : 0;
            if (!xp) break;
            const loc = currentFrame.locator(`xpath=${xp}`).nth(idx);
            await executeSmartClick(page, loc, 1);
            break;
          }
        case 'ClickClass':
          if (val) {
            const loc = currentFrame.locator(`.${val.trim()}`).first();
            await executeSmartClick(page, loc, 1);
          }
          break;
        case 'ClickId':
          if (val) {
            const loc = currentFrame.locator(`#${val.trim()}`).first();
            await executeSmartClick(page, loc, 1);
          }
          break;

        // ── Click Ngẫu Nhiên ──────────────────────────────────────────────
        case 'ClickRandomXpath':
        case 'ClickRandom2Xpath':
        case 'ClickRandomDisplayXpath':
          {
            if (!val) break;
            const elems = await currentFrame.locator(`xpath=${val.trim()}`).all().catch(() => []);
            const visible = [];
            for (const el of elems) {
              if (await el.isVisible().catch(() => false)) visible.push(el);
            }
            if (visible.length === 0) break;
            await executeSmartClick(page, visible[randInt(0, visible.length - 1)], 1);
            break;
          }
        case 'ClickAllRadioXpath':
          {
            if (!val) break;
            const radios = await currentFrame.locator(`xpath=${val.trim()}`).all().catch(() => []);
            for (const radio of radios) {
              await executeSmartClick(page, radio, 1);
              await delay(randInt(100, 300));
            }
            break;
          }
        case 'ClickRadioRandomXpath':
          {
            const parts = val.split('|');
            const xp = parts[0]?.trim();
            const minD = parseInt(parts[1], 10) || 100;
            const maxD = parseInt(parts[2], 10) || 300;
            if (!xp) break;
            const elems = await currentFrame.locator(`xpath=${xp}`).all().catch(() => []);
            const visible = [];
            for (const el of elems) {
              if (await el.isVisible().catch(() => false)) visible.push(el);
            }
            if (visible.length === 0) break;
            await executeSmartClick(page, visible[randInt(0, visible.length - 1)], 1);
            await delay(randInt(minD, maxD));
            break;
          }

        // ── Select Dropdown & State & Gender ─────────────────────────────
        case 'GenderSelect':
          {
            const parts = val.split('|');
            if (parts.length >= 2 && (parts[0].includes('(') || parts[0].includes(';'))) {
              // JS code format: maleJs|femaleJs
              const isMale = /^m|male|nam/i.test(vars.Gender);
              const jsCode = isMale ? parts[0].trim() : parts[1].trim();
              if (jsCode) await page.evaluate(jsCode).catch(() => {});
            } else if (parts.length >= 2) {
              // Syntax: Selector|Gender
              await handleGenderSelect(page, currentFrame, parts[0].trim(), parts[1].trim() || vars.Gender);
            } else {
              // Syntax: {GenderSelect}={Gender}
              await handleGenderSelect(page, currentFrame, 'auto', val.trim() || vars.Gender);
            }
            break;
          }
        case 'TrySelectState':
          {
            // Syntax: {TrySelectState}=Selector
            await handleTrySelectState(page, currentFrame, val.trim(), vars.State);
            break;
          }
        case 'TrySelectOption':
          {
            // Syntax: {TrySelectOption}=Selector|value
            const pipeIdx = val.indexOf('|');
            if (pipeIdx !== -1) {
              await handleTrySelectOption(page, currentFrame, val.slice(0, pipeIdx).trim(), val.slice(pipeIdx + 1).trim());
            } else {
              await handleTrySelectOption(page, currentFrame, 'select', val.trim());
            }
            break;
          }
        case 'TrySelectRadioByText':
          {
            // Syntax: {TrySelectRadioByText}=Selector|value hoặc {TrySelectRadioByText}=value
            const pipeIdx = val.indexOf('|');
            if (pipeIdx !== -1) {
              await handleTrySelectRadioByText(page, currentFrame, val.slice(0, pipeIdx).trim(), val.slice(pipeIdx + 1).trim());
            } else {
              await handleTrySelectRadioByText(page, currentFrame, 'auto', val.trim());
            }
            break;
          }
        case 'SelectOptionValueXpath':
          {
            const parts = val.split('|');
            if (parts[0]) await selectByValue(currentFrame.locator(`xpath=${parts[0].trim()}`).first(), parts[1]?.trim() ?? '');
            break;
          }
        case 'SelectOptionValueId':
          {
            const parts = val.split('|');
            if (parts.length >= 2) await selectByValue(currentFrame.locator(`#${parts[0].trim()}`).first(), parts[1].trim());
            break;
          }
        case 'SelectOptionValueClass':
          {
            const parts = val.split('|');
            if (parts.length >= 2) await selectByValue(currentFrame.locator(`.${parts[0].trim()}`).first(), parts[1].trim());
            break;
          }
        case 'SelectOptionIndexXpath':
          {
            const parts = val.split('|');
            if (parts.length >= 2) await selectByIndex(currentFrame.locator(`xpath=${parts[0].trim()}`).first(), parts[1].trim());
            break;
          }
        case 'SelectOptionIndexId':
          {
            const parts = val.split('|');
            if (parts.length >= 2) await selectByIndex(currentFrame.locator(`#${parts[0].trim()}`).first(), parts[1].trim());
            break;
          }
        case 'SelectOptionIndexClass':
          {
            const parts = val.split('|');
            if (parts.length >= 2) await selectByIndex(currentFrame.locator(`.${parts[0].trim()}`).first(), parts[1].trim());
            break;
          }
        case 'SelectOptionTextXpath':
          {
            const parts = val.split('|');
            if (parts.length >= 2) await selectByText(currentFrame.locator(`xpath=${parts[0].trim()}`).first(), parts[1].trim());
            break;
          }
        case 'SelectOptionTextId':
          {
            const parts = val.split('|');
            if (parts.length >= 2) await selectByText(currentFrame.locator(`#${parts[0].trim()}`).first(), parts[1].trim());
            break;
          }
        case 'SelectOptionTextClass':
          {
            const parts = val.split('|');
            if (parts.length >= 2) await selectByText(currentFrame.locator(`.${parts[0].trim()}`).first(), parts[1].trim());
            break;
          }
        case 'SelectOptionRandomXpath':
          {
            if (val) {
              const loc = currentFrame.locator(`xpath=${val.trim()}`).first();
              await selectRandom(loc);
            }
            break;
          }

        // ── JavaScript ───────────────────────────────────────────────────
        case 'JS':
          if (val) await page.evaluate(val).catch(e => {
            logger?.({
              type: 'script_warn',
              detail: `{JS}: ${e.message}`
            });
          });
          break;

        // ── iFrame ───────────────────────────────────────────────────────
        case 'iFrame':
          currentFrame = val ? page.frameLocator(val) : page;
          break;

        // ── Cuộn Trang ───────────────────────────────────────────────────
        case 'ScrollDown':
          await page.evaluate(() => window.scrollBy(0, 400)).catch(() => {});
          break;
        case 'ScrollUp':
          await page.evaluate(() => window.scrollBy(0, -400)).catch(() => {});
          break;

        // ── Giải Captcha ──────────────────────────────────────────────────
        case 'ByPassReCaptcha':
          {
            if (!captchaApiKey) {
              logger?.({
                type: 'script_warn',
                detail: 'ByPassReCaptcha: thiếu captchaApiKey, bỏ qua.'
              });
              break;
            }
            const siteKey = await page.evaluate(() => document.querySelector('[data-sitekey]')?.getAttribute('data-sitekey') ?? null).catch(() => null);
            if (!siteKey) {
              logger?.({
                type: 'script_warn',
                detail: 'ByPassReCaptcha: không tìm thấy site key.'
              });
              break;
            }
            logger?.({
              type: 'script_step',
              detail: `ByPassReCaptcha: đang giải siteKey=${siteKey.slice(0, 12)}…`
            });
            const token = await solveReCaptcha(siteKey, page.url(), captchaApiKey);
            await page.evaluate(t => {
              const ta = document.getElementById('g-recaptcha-response');
              if (ta) {
                ta.value = t;
                ta.dispatchEvent(new Event('input', {
                  bubbles: true
                }));
                ta.dispatchEvent(new Event('change', {
                  bubbles: true
                }));
              }
              try {
                for (const client of Object.values(window.___grecaptcha_cfg?.clients ?? {})) {
                  const cb = client?.['0']?.['0']?.callback ?? client?.callback;
                  if (typeof cb === 'function') cb(t);
                }
              } catch {}
            }, token).catch(() => {});
            logger?.({
              type: 'script_step',
              detail: 'ByPassReCaptcha: inject token OK.'
            });
            break;
          }
        default:
          logger?.({
            type: 'script_warn',
            detail: `Lệnh chưa hỗ trợ: {${cmd}}`
          });
      }
    } catch (err) {
      logger?.({
        type: 'script_error',
        detail: `{${cmd}}=${val.slice(0, 60)}: ${err.message}`
      });
    }
  }
}
export { runScript };
