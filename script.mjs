/**
 * Script runner — parse và thực thi file .txt script kiểu Windows exe qua Playwright.
 *
 * Định dạng: {Cmd}=arg  hoặc  {Cmd}
 * Delay có thể là số cố định hoặc khoảng ngẫu nhiên: {Delay}=2|5  (chọn ngẫu nhiên 2–5 giây)
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { solveReCaptcha } from './captcha.mjs';

// ── Parser ─────────────────────────────────────────────────────────────────

/** Phân tích file script thành mảng bước [{cmd, arg}]. */
export function parseScript(text) {
  const steps = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;
    const match = line.match(/^\{([^}]+)\}(?:=(.*))?$/);
    if (!match) continue;
    steps.push({ cmd: match[1], arg: match[2] ?? '' });
  }
  return steps;
}

/** Đọc file rồi phân tích thành bước. */
export async function loadScript(filePath) {
  const text = await readFile(filePath, 'utf8');
  return parseScript(text);
}

// ── Variables ──────────────────────────────────────────────────────────────

function buildVars(record) {
  const r = record ?? {};
  const phone = String(r.phone ?? r.phonenumber ?? r.phonefull ?? '').replace(/\D/g, '');
  const stateRaw = String(r.state ?? r.statecode ?? '');
  return {
    Fname:        r.firstname    ?? r.fname        ?? r.first_name  ?? '',
    Lname:        r.lastname     ?? r.lname         ?? r.last_name   ?? '',
    Phone:        phone,
    Phone1:       phone.slice(0, 3),
    Phone2:       phone.slice(3, 6),
    Phone3:       phone.slice(6, 10),
    Address:      r.address      ?? r.streetaddress ?? r.street      ?? '',
    City:         r.city         ?? '',
    State:        stateRaw.length === 2 ? stateRaw.toUpperCase() : stateRaw,
    Zipcode:      r.zipcode      ?? r.zip           ?? r.postalcode   ?? '',
    AccountEmail: r.email        ?? r.emailaddress  ?? r.mail         ?? '',
    Email:        r.email        ?? r.emailaddress  ?? r.mail         ?? '',
    PassEmail:    r.passEmail    ?? r.emailpassword  ?? '',
    RecoverEmail: r.recoverEmail ?? r.recoveryemail  ?? '',
    Month:        String(r.month    ?? r.birthmonth  ?? r.dob_month    ?? ''),
    Day:          String(r.day      ?? r.birthday     ?? r.dob_day      ?? ''),
    Year:         String(r.year     ?? r.birthyear    ?? r.dob_year     ?? ''),
    Gender:       r.gender       ?? '',
    Sex:          r.gender       ?? r.sex            ?? '',
    Home:         r.home         ?? r.homephone       ?? '',
    Username:     r.username     ?? '',
    Password:     r.password     ?? '',
  };
}

export function interpolate(text, record) {
  const vars = buildVars(record);
  return String(text).replace(/\{([^}]+)\}/g, (_, k) => vars[k] ?? '');
}

// ── Helpers ────────────────────────────────────────────────────────────────

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Phân tích "min|max" hoặc số cố định thành ms. */
function parseDelayMs(val) {
  const parts = String(val).split('|');
  const a = Math.max(0, parseFloat(parts[0]) || 0);
  const b = parts[1] != null ? Math.max(0, parseFloat(parts[1]) || 0) : a;
  return (a <= b ? randInt(a * 1000, b * 1000) : randInt(b * 1000, a * 1000));
}

async function delay(ms) {
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

/** Đọc một dòng ngẫu nhiên từ file text. */
async function randomTextFile(filename, scriptDir = '') {
  const candidates = [
    join(scriptDir, filename),
    join(process.cwd(), 'Text', filename),
    join(process.env.HOME ?? '', 'Downloads', 'AutoLeadPC', 'Text', filename),
  ];
  for (const p of candidates) {
    try {
      const lines = (await readFile(p, 'utf8')).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length) return lines[randInt(0, lines.length - 1)];
    } catch {}
  }
  return '';
}

/** Thay thế {Var} và RandomTextFile(...) trong chuỗi. */
async function subAsync(text, vars, scriptDir) {
  let result = String(text).replace(/\{([^}]+)\}/g, (_, k) => vars[k] ?? '');
  // RandomTextFile(filename.txt)
  const rtfRe = /RandomTextFile\(([^)]+)\)/g;
  let m;
  const replacements = [];
  while ((m = rtfRe.exec(result)) !== null) {
    replacements.push({ match: m[0], file: m[1] });
  }
  for (const { match, file } of replacements) {
    const val = await randomTextFile(file, scriptDir);
    result = result.replace(match, val);
  }
  return result;
}

// ── Playwright locator helpers ────────────────────────────────────────────

/** Trả về locator tương ứng với selector type: id/class/xpath/name */
function makeLocator(frame, selectorType, selectorVal, index = 0) {
  let base;
  switch (selectorType) {
    case 'id':    base = frame.locator(`#${selectorVal}`); break;
    case 'class': base = frame.locator(`.${selectorVal}`); break;
    case 'name':  base = frame.locator(`[name="${selectorVal}"]`); break;
    case 'xpath': base = frame.locator(`xpath=${selectorVal}`); break;
    default:      base = frame.locator(selectorVal);
  }
  return index > 0 ? base.nth(index) : base.first();
}

async function selectByValue(loc, value) {
  await loc.selectOption({ value }, { timeout: 5000 })
    .catch(() => loc.selectOption({ label: new RegExp(value, 'i') }, { timeout: 5000 }).catch(() => {}));
}

async function selectByIndex(loc, idx) {
  const count = await loc.locator('option').count().catch(() => 0);
  if (count === 0) return;
  const safeIdx = Math.min(Math.max(0, Number(idx) || 0), count - 1);
  await loc.selectOption({ index: safeIdx }, { timeout: 5000 }).catch(() => {});
}

async function selectByText(loc, text) {
  await loc.selectOption({ label: text }, { timeout: 5000 })
    .catch(() => loc.selectOption({ label: new RegExp(text, 'i') }, { timeout: 5000 }).catch(() => {}));
}

async function selectRandom(loc) {
  const count = await loc.locator('option').count().catch(() => 0);
  if (count < 2) return;
  await loc.selectOption({ index: randInt(1, count - 1) }, { timeout: 5000 }).catch(() => {});
}

// ── Runner ─────────────────────────────────────────────────────────────────

/**
 * Thực thi danh sách bước script trên trang Playwright.
 *
 * @param {import('playwright').Page} page
 * @param {Array<{cmd:string,arg:string}>} steps
 * @param {object} record Bản ghi autofill
 * @param {{captchaApiKey?: string, logger?: function, scriptDir?: string}} opts
 */
export async function runScript(page, steps, record, {
  captchaApiKey = '',
  logger = null,
  scriptDir = '',
} = {}) {
  const vars = buildVars(record ?? {});
  const sub = async (text) => subAsync(text, vars, scriptDir);

  // currentFrame: Page hoặc FrameLocator
  let currentFrame = page;

  for (const { cmd, arg } of steps) {
    const val = await sub(arg);
    logger?.({ type: 'script_step', detail: `{${cmd}}${val ? '=' + val.slice(0, 80) : ''}` });
    try {
      switch (cmd) {

        // ── No-op ────────────────────────────────────────────────────────
        case 'Note': case 'EmailConfig': case 'InfoConfig':
        case 'CheckTenOffer': case 'LoadTime': case 'ByPassReCaptchaCallback':
        case 'LoginGmail':  // complex flow, skip
          break;

        // ── Chờ ─────────────────────────────────────────────────────────
        case 'Delay':
          await delay(parseDelayMs(val));
          break;

        case 'CheckPageLoaded':
        case 'CheckPageLoadedScript':
          await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
          break;

        case 'DisplayEndXpath':
          if (val) await page.waitForSelector(`xpath=${val}`, { timeout: 15000 }).catch(() => {});
          break;

        case 'Check': {
          // format: name|timeoutSec
          const [checkName, checkTimeout] = val.split('|');
          const ms = (parseFloat(checkTimeout) || 10) * 1000;
          if (checkName) {
            await page.waitForSelector(`[name="${checkName.trim()}"]`, { timeout: ms }).catch(() => {});
          }
          break;
        }

        case 'CheckNoXpath': {
          // format: //xpath|timeoutSec — chờ element không còn tồn tại / không hiển thị lỗi
          const [noXpath, noTimeout] = val.split('|');
          const ms = (parseFloat(noTimeout) || 10) * 1000;
          if (noXpath) {
            await page.waitForSelector(`xpath=${noXpath.trim()}`, { state: 'hidden', timeout: ms }).catch(() => {});
          }
          break;
        }

        // ── Điều hướng ───────────────────────────────────────────────────
        case 'Navigate': case 'Url':
          if (val) await page.goto(val, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          break;

        case 'Newtab':
          if (val) {
            const newPage = await page.context().newPage();
            await newPage.goto(val, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          }
          break;

        case 'Close':
          await page.close().catch(() => {});
          break;

        case 'SwitchToWindowHandles': {
          const idx = parseInt(val, 10) || 0;
          const pages = page.context().pages();
          if (pages[idx] && !pages[idx].isClosed()) await pages[idx].bringToFront().catch(() => {});
          break;
        }

        case 'SwitchToWindowHandlesLast': {
          const allPages = page.context().pages();
          const last = allPages[allPages.length - 1];
          if (last && !last.isClosed()) await last.bringToFront().catch(() => {});
          break;
        }

        // ── Điền form — by Name ─────────────────────────────────────────
        case 'SendByName': {
          // format: name|value|maxlen
          const [fName, fVal] = val.split('|');
          const fieldVal = fVal != null ? await sub(fVal.trim()) : '';
          if (!fName?.trim()) break;
          const loc = currentFrame.locator(`[name="${fName.trim()}"]`).first();
          if (await loc.count().catch(() => 0) === 0) break;
          await loc.fill(fieldVal, { timeout: 5000 }).catch(async () => {
            await loc.type(fieldVal, { delay: 30 }).catch(() => {});
          });
          break;
        }

        // ── Điền form — by ID ────────────────────────────────────────────
        case 'SendById': {
          // format: id|value|maxlen
          const [fId, fVal] = val.split('|');
          const fieldVal = fVal != null ? await sub(fVal.trim()) : '';
          if (!fId?.trim()) break;
          const loc = currentFrame.locator(`#${fId.trim()}`).first();
          if (await loc.count().catch(() => 0) === 0) break;
          await loc.fill(fieldVal, { timeout: 5000 }).catch(async () => {
            await loc.type(fieldVal, { delay: 30 }).catch(() => {});
          });
          break;
        }

        // ── Điền form — by Class ─────────────────────────────────────────
        case 'SendByClass': {
          // format: class|index|value|maxlen  hoặc  class|value|maxlen (index=0)
          const parts = val.split('|');
          let cls, idx, fieldVal;
          if (parts.length >= 3 && !isNaN(Number(parts[1]))) {
            [cls, idx, fieldVal] = parts;
          } else {
            [cls, fieldVal] = parts; idx = '0';
          }
          fieldVal = fieldVal != null ? await sub(fieldVal.trim()) : '';
          if (!cls?.trim()) break;
          const loc = currentFrame.locator(`.${cls.trim()}`).nth(Number(idx) || 0);
          if (await loc.count().catch(() => 0) === 0) break;
          await loc.fill(fieldVal, { timeout: 5000 }).catch(async () => {
            await loc.type(fieldVal, { delay: 30 }).catch(() => {});
          });
          break;
        }

        // ── Điền form — by XPath ─────────────────────────────────────────
        case 'SendByXpath': {
          // format: //xpath|index|value|maxlen
          const parts = val.split('|');
          const xp = parts[0]?.trim();
          const idx = isNaN(Number(parts[1])) ? 0 : Number(parts[1]);
          const fVal = parts[2] != null ? await sub(parts[2].trim()) : '';
          if (!xp) break;
          const loc = currentFrame.locator(`xpath=${xp}`).nth(idx);
          if (await loc.count().catch(() => 0) === 0) break;
          await loc.fill(fVal, { timeout: 5000 }).catch(async () => {
            await loc.type(fVal, { delay: 30 }).catch(() => {});
          });
          break;
        }

        case 'SendKeyEnterByXpath': {
          const xp = val.trim();
          if (!xp) break;
          const loc = currentFrame.locator(`xpath=${xp}`).first();
          await loc.press('Enter', { timeout: 5000 }).catch(() => {});
          break;
        }

        // ── Click ────────────────────────────────────────────────────────
        case 'SmartClick':
        case 'ClickXpathActions':
        case 'ClickXpath': {
          if (!val) break;
          // format: //xpath|index (index tuỳ chọn)
          const parts = val.split('|');
          const xp = parts[0]?.trim();
          const idx = parts[1] != null && !isNaN(Number(parts[1])) ? Number(parts[1]) : 0;
          if (!xp) break;
          const loc = currentFrame.locator(`xpath=${xp}`).nth(idx);
          await loc.click({ timeout: 8000 }).catch(() => {
            logger?.({ type: 'script_warn', detail: `{${cmd}} không click được: ${xp} [${idx}]` });
          });
          break;
        }

        case 'ClickClass':
          if (val) await currentFrame.locator(`.${val.trim()}`).first().click({ timeout: 5000 }).catch(() => {});
          break;

        case 'ClickId':
          if (val) await currentFrame.locator(`#${val.trim()}`).first().click({ timeout: 5000 }).catch(() => {});
          break;

        // ── Click ngẫu nhiên ─────────────────────────────────────────────
        case 'ClickRandomXpath':
        case 'ClickRandom2Xpath':
        case 'ClickRandomDisplayXpath': {
          if (!val) break;
          const elems = await currentFrame.locator(`xpath=${val.trim()}`).all().catch(() => []);
          const visible = [];
          for (const el of elems) {
            if (await el.isVisible().catch(() => false)) visible.push(el);
          }
          if (visible.length === 0) break;
          await visible[randInt(0, visible.length - 1)].click({ timeout: 5000 }).catch(() => {});
          break;
        }

        case 'ClickAllRadioXpath': {
          if (!val) break;
          const radios = await currentFrame.locator(`xpath=${val.trim()}`).all().catch(() => []);
          for (const radio of radios) {
            await radio.click({ timeout: 3000 }).catch(() => {});
            await delay(randInt(100, 300));
          }
          break;
        }

        case 'ClickRadioRandomXpath': {
          // format: //xpath|minDelay|maxDelay
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
          await visible[randInt(0, visible.length - 1)].click({ timeout: 5000 }).catch(() => {});
          await delay(randInt(minD, maxD));
          break;
        }

        // ── Select dropdown ──────────────────────────────────────────────
        case 'TrySelectState': {
          const eqIdx = val.indexOf('=');
          if (eqIdx === -1) break;
          const attrType = val.slice(0, eqIdx).trim();
          const attrVal  = val.slice(eqIdx + 1).trim();
          if (!attrVal) break;
          const sel = attrType === 'id' ? `#${attrVal}` : `[name="${attrVal}"]`;
          const loc = currentFrame.locator(sel).first();
          if (await loc.count().catch(() => 0) === 0) break;
          await selectByValue(loc, vars.State);
          break;
        }

        case 'TrySelectOption': {
          // format: selector=value  hoặc  id=selectId|value
          const pipeIdx = val.indexOf('|');
          if (pipeIdx !== -1) {
            const selector = val.slice(0, pipeIdx).trim();
            const optVal = val.slice(pipeIdx + 1).trim();
            const loc = currentFrame.locator(selector).first();
            await selectByValue(loc, optVal);
          }
          break;
        }

        case 'TrySelectRadioByText': {
          if (!val) break;
          const labels = await page.locator('label').all().catch(() => []);
          for (const label of labels) {
            const text = await label.textContent().catch(() => '');
            if (text?.toLowerCase().includes(val.toLowerCase())) {
              await label.click({ timeout: 3000 }).catch(() => {});
              break;
            }
          }
          break;
        }

        case 'SelectOptionValueXpath': {
          // format: //xpath|value  hoặc  //xpath|value|Acronym
          const parts = val.split('|');
          const xp = parts[0]?.trim(); const optVal = parts[1]?.trim() ?? '';
          if (!xp) break;
          await selectByValue(currentFrame.locator(`xpath=${xp}`).first(), optVal);
          break;
        }
        case 'SelectOptionValueId': {
          const parts = val.split('|');
          if (parts.length < 2) break;
          await selectByValue(currentFrame.locator(`#${parts[0].trim()}`).first(), parts[1].trim());
          break;
        }
        case 'SelectOptionValueClass': {
          const parts = val.split('|');
          if (parts.length < 2) break;
          await selectByValue(currentFrame.locator(`.${parts[0].trim()}`).first(), parts[1].trim());
          break;
        }

        case 'SelectOptionIndexXpath': {
          const parts = val.split('|');
          if (parts.length < 2) break;
          await selectByIndex(currentFrame.locator(`xpath=${parts[0].trim()}`).first(), parts[1].trim());
          break;
        }
        case 'SelectOptionIndexId': {
          const parts = val.split('|');
          if (parts.length < 2) break;
          await selectByIndex(currentFrame.locator(`#${parts[0].trim()}`).first(), parts[1].trim());
          break;
        }
        case 'SelectOptionIndexClass': {
          const parts = val.split('|');
          if (parts.length < 2) break;
          await selectByIndex(currentFrame.locator(`.${parts[0].trim()}`).first(), parts[1].trim());
          break;
        }

        case 'SelectOptionTextXpath': {
          const parts = val.split('|');
          if (parts.length < 2) break;
          await selectByText(currentFrame.locator(`xpath=${parts[0].trim()}`).first(), parts[1].trim());
          break;
        }
        case 'SelectOptionTextId': {
          const parts = val.split('|');
          if (parts.length < 2) break;
          await selectByText(currentFrame.locator(`#${parts[0].trim()}`).first(), parts[1].trim());
          break;
        }
        case 'SelectOptionTextClass': {
          const parts = val.split('|');
          if (parts.length < 2) break;
          await selectByText(currentFrame.locator(`.${parts[0].trim()}`).first(), parts[1].trim());
          break;
        }

        case 'SelectOptionRandomXpath': {
          if (!val) break;
          const loc = currentFrame.locator(`xpath=${val.trim()}`).first();
          if (await loc.count().catch(() => 0) === 0) break;
          await selectRandom(loc);
          break;
        }

        // ── Dropdown giới tính ────────────────────────────────────────────
        case 'GenderSelect': {
          // Format 1: {GenderSelect}={Gender}  (dùng value từ record)
          // Format 2: {GenderSelect}=maleJsCode|femaleJsCode  (2 đoạn JS tuỳ theo giới)
          const parts = val.split('|');
          if (parts.length >= 2) {
            // Format 2: JS tuỳ theo giới tính
            const isMale = /^m|male|nam/i.test(vars.Gender);
            const jsCode = isMale ? parts[0].trim() : parts[1].trim();
            if (jsCode) await page.evaluate(jsCode).catch(() => {});
          } else {
            // Format 1: select dropdown
            const gVal = val.trim() || vars.Gender;
            if (!gVal) break;
            const sel = currentFrame.locator('select[name*="gender" i], select[id*="gender" i], select[name*="sex" i]').first();
            if (await sel.count().catch(() => 0) === 0) break;
            await sel.selectOption({ label: new RegExp(gVal, 'i') }, { timeout: 5000 })
              .catch(() => sel.selectOption({ value: gVal.toLowerCase() }, { timeout: 5000 }).catch(() => {}));
          }
          break;
        }

        // ── JavaScript ─────────────────────────────────────────────────────
        case 'JS':
          if (val) await page.evaluate(val).catch((e) => {
            logger?.({ type: 'script_warn', detail: `{JS}: ${e.message}` });
          });
          break;

        // ── iFrame ─────────────────────────────────────────────────────────
        case 'iFrame':
          currentFrame = val ? page.frameLocator(val) : page;
          break;

        // ── Cuộn ───────────────────────────────────────────────────────────
        case 'ScrollDown':
          await page.evaluate(() => window.scrollBy(0, 400)).catch(() => {});
          break;

        case 'ScrollUp':
          await page.evaluate(() => window.scrollBy(0, -400)).catch(() => {});
          break;

        // ── Giải captcha ────────────────────────────────────────────────────
        case 'ByPassReCaptcha': {
          if (!captchaApiKey) {
            logger?.({ type: 'script_warn', detail: 'ByPassReCaptcha: thiếu captchaApiKey, bỏ qua.' });
            break;
          }
          const siteKey = await page.evaluate(() =>
            document.querySelector('[data-sitekey]')?.getAttribute('data-sitekey') ?? null,
          ).catch(() => null);
          if (!siteKey) {
            logger?.({ type: 'script_warn', detail: 'ByPassReCaptcha: không tìm thấy site key.' });
            break;
          }
          logger?.({ type: 'script_step', detail: `ByPassReCaptcha: đang giải siteKey=${siteKey.slice(0, 12)}…` });
          const token = await solveReCaptcha(siteKey, page.url(), captchaApiKey);
          await page.evaluate((t) => {
            const ta = document.getElementById('g-recaptcha-response');
            if (ta) {
              ta.value = t;
              ta.dispatchEvent(new Event('input',  { bubbles: true }));
              ta.dispatchEvent(new Event('change', { bubbles: true }));
            }
            try {
              for (const client of Object.values(window.___grecaptcha_cfg?.clients ?? {})) {
                const cb = client?.['0']?.['0']?.callback ?? client?.callback;
                if (typeof cb === 'function') cb(t);
              }
            } catch {}
          }, token).catch(() => {});
          logger?.({ type: 'script_step', detail: 'ByPassReCaptcha: inject token OK.' });
          break;
        }

        default:
          logger?.({ type: 'script_warn', detail: `Lệnh chưa hỗ trợ: {${cmd}}` });
      }
    } catch (err) {
      logger?.({ type: 'script_error', detail: `{${cmd}}=${val.slice(0, 60)}: ${err.message}` });
    }
  }
}
