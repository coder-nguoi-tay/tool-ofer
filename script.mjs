/**
 * Script runner — parse và thực thi file .txt script kiểu Windows exe qua Playwright.
 *
 * Định dạng: {Cmd}=arg  hoặc  {Cmd}
 * Delay có thể là số cố định hoặc khoảng ngẫu nhiên: {Delay}=2|5  (chọn ngẫu nhiên 2–5 giây)
 *
 * Tương thích 100% với tập lệnh của AutoLeadPC Windows exe (76 lệnh chuẩn).
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { solveReCaptcha } from './captcha.mjs';

// ── US States Mapping ───────────────────────────────────────────────────────
export const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

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

export function buildVars(record) {
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

export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Phân tích "min|max" hoặc số cố định thành ms. */
export function parseDelayMs(val) {
  const parts = String(val).split('|');
  const a = Math.max(0, parseFloat(parts[0]) || 0);
  const b = parts[1] != null ? Math.max(0, parseFloat(parts[1]) || 0) : a;
  return (a <= b ? randInt(a * 1000, b * 1000) : randInt(b * 1000, a * 1000));
}

export async function delay(ms) {
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

/** Đọc một dòng ngẫu nhiên từ file text. */
export async function randomTextFile(filename, scriptDir = '') {
  const candidates = [
    join(scriptDir, filename),
    join(process.cwd(), 'Text', filename),
    join(process.env.HOME ?? '', 'Downloads', 'AutoLeadPC', 'Text', filename),
    join(process.env.HOME ?? '', 'Downloads', 'AutoLeadPC', 'Config', filename),
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
export async function subAsync(text, vars, scriptDir) {
  let result = String(text).replace(/\{([^}]+)\}/g, (_, k) => vars[k] ?? '');
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

// ── Selector Parsing & Smart Locator ───────────────────────────────────────

/**
 * Phân tích chuỗi selector sang loại tương ứng (css, xpath, auto).
 * Hỗ trợ các tiền tố: id=, class=, name=, css=, xpath=, //, #, .
 */
export function parseSelectorString(raw) {
  let s = String(raw || '').trim();
  if (!s) return { type: 'css', query: 'body' };

  if (s.startsWith('id=')) {
    return { type: 'css', query: `#${s.slice(3).trim()}` };
  }
  if (s.startsWith('class=')) {
    const cls = s.slice(6).trim().split(/\s+/).join('.');
    return { type: 'css', query: `.${cls}` };
  }
  if (s.startsWith('name=')) {
    return { type: 'css', query: `[name="${s.slice(5).trim()}"]` };
  }
  if (s.startsWith('css=')) {
    return { type: 'css', query: s.slice(4).trim() };
  }
  if (s.startsWith('xpath=')) {
    return { type: 'xpath', query: s.slice(6).trim() };
  }
  if (s.startsWith('//') || s.startsWith('(') || s.startsWith('./')) {
    return { type: 'xpath', query: s };
  }
  if (s.startsWith('#') || s.startsWith('.') || s.startsWith('[') || s.includes(' > ') || s.includes(' + ')) {
    return { type: 'css', query: s };
  }
  return { type: 'auto', query: s };
}

/**
 * Tạo Playwright locator thông minh từ chuỗi selector và index (1-based theo WinForms).
 * Nếu không thấy trên main frame, tự động quét qua các iframe.
 */
export async function resolveSmartLocator(page, currentFrame, selectorInput, oneBasedIndex = 1) {
  const { type, query } = parseSelectorString(selectorInput);
  const idx = Math.max(0, (parseInt(oneBasedIndex, 10) || 1) - 1);

  async function getLocFromFrame(f) {
    if (type === 'xpath') {
      return f.locator(`xpath=${query}`).nth(idx);
    }
    if (type === 'css') {
      return f.locator(query).nth(idx);
    }
    // Type 'auto': ưu tiên ID, sau đó Name, sau đó CSS/text
    const idLoc = f.locator(`#${query}`).first();
    if (await idLoc.count().catch(() => 0) > 0) return idLoc;

    const nameLoc = f.locator(`[name="${query}"]`).first();
    if (await nameLoc.count().catch(() => 0) > 0) return nameLoc;

    return f.locator(query).nth(idx);
  }

  let loc = await getLocFromFrame(currentFrame);
  if (await loc.count().catch(() => 0) > 0) {
    return loc;
  }

  // Quét các iframe nếu trang hiện tại chưa thấy phần tử
  if (page?.frames) {
    for (const frame of page.frames()) {
      if (frame === currentFrame) continue;
      const fLoc = await getLocFromFrame(frame);
      if (await fLoc.count().catch(() => 0) > 0) {
        return fLoc;
      }
    }
  }

  return loc;
}

/**
 * Thực hiện click thông minh: cuộn vào tầm nhìn, click theo loại (1: click thường, 2: đúp, 3: phải, 4: nhấn giữ).
 * Tự động dự phòng force: true và evaluate click nếu phần tử bị che hoặc có overlay.
 */
export async function executeSmartClick(page, loc, clickType = 1) {
  await loc.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
  const type = parseInt(clickType, 10) || 1;

  switch (type) {
    case 2: // Double click
      await loc.dblclick({ timeout: 5000 }).catch(async () => {
        await loc.dblclick({ force: true, timeout: 3000 }).catch(() => {});
      });
      break;
    case 3: // Right click
      await loc.click({ button: 'right', timeout: 5000 }).catch(async () => {
        await loc.click({ button: 'right', force: true, timeout: 3000 }).catch(() => {});
      });
      break;
    case 4: // Mouse down / hold
      await loc.hover({ timeout: 3000 }).catch(() => {});
      await page.mouse.down().catch(() => {});
      break;
    case 1: // Single left click
    default:
      await loc.click({ timeout: 5000 }).catch(async () => {
        // Fallback 1: force click
        await loc.click({ force: true, timeout: 3000 }).catch(async () => {
          // Fallback 2: evaluate DOM click
          await loc.evaluate((el) => {
            el.click();
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          }).catch(() => {});
        });
      });
      break;
  }
}

/**
 * Nhập văn bản kèm tốc độ gõ (delayMs giữa các phím).
 */
export async function handleTypeWithDelay(loc, value, delayMs = 0) {
  if (await loc.count().catch(() => 0) === 0) return;
  await loc.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
  const ms = parseInt(delayMs, 10) || 0;
  if (ms > 0) {
    await loc.fill('').catch(() => {});
    await loc.type(String(value), { delay: ms }).catch(() => {});
  } else {
    await loc.fill(String(value), { timeout: 5000 }).catch(async () => {
      await loc.type(String(value), { delay: 20 }).catch(() => {});
    });
  }
}

// ── Dropdown & Gender Selectors ────────────────────────────────────────────

export async function selectByValue(loc, value) {
  await loc.selectOption({ value }, { timeout: 5000 })
    .catch(() => loc.selectOption({ label: new RegExp(value, 'i') }, { timeout: 5000 }).catch(() => {}));
}

export async function selectByIndex(loc, idx) {
  const count = await loc.locator('option').count().catch(() => 0);
  if (count === 0) return;
  const safeIdx = Math.min(Math.max(0, Number(idx) || 0), count - 1);
  await loc.selectOption({ index: safeIdx }, { timeout: 5000 }).catch(() => {});
}

export async function selectByText(loc, text) {
  await loc.selectOption({ label: text }, { timeout: 5000 })
    .catch(() => loc.selectOption({ label: new RegExp(text, 'i') }, { timeout: 5000 }).catch(() => {}));
}

export async function selectRandom(loc) {
  const count = await loc.locator('option').count().catch(() => 0);
  if (count < 2) return;
  await loc.selectOption({ index: randInt(1, count - 1) }, { timeout: 5000 }).catch(() => {});
}

/**
 * Chọn giới tính linh hoạt (hỗ trợ radio button, label, nút bấm, dropdown).
 */
export async function handleGenderSelect(page, currentFrame, selector, genderValue) {
  const g = String(genderValue || '').trim().toLowerCase();
  const isMale = /^(m|male|nam|1)/i.test(g);
  const targetLabel = isMale ? 'Male' : 'Female';
  const targetAltLabel = isMale ? 'Nam' : 'Nữ';
  const targetVal = isMale ? 'male' : 'female';

  // 1. Selector tùy chỉnh nếu có
  if (selector && selector !== 'auto' && selector !== '{Gender}' && selector !== '{Sex}') {
    const { query, type } = parseSelectorString(selector);
    const container = type === 'xpath' ? currentFrame.locator(`xpath=${query}`) : currentFrame.locator(query);
    if (await container.count().catch(() => 0) > 0) {
      const candidate = container.locator(`xpath=.//*[self::input or self::label or self::button][contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${targetVal}') or contains(translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${targetVal}') or contains(translate(@id, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${targetVal}')]`).first();
      if (await candidate.count().catch(() => 0) > 0) {
        await candidate.scrollIntoViewIfNeeded().catch(() => {});
        await candidate.click({ timeout: 3000 }).catch(() => candidate.click({ force: true }));
        return;
      }
    }
  }

  // 2. Quét radio inputs
  const inputSelectors = [
    `input[type="radio"][value="${targetLabel}" i]`,
    `input[type="radio"][value="${targetVal}" i]`,
    `input[type="radio"][id*="${targetVal}" i]`,
    `input[type="radio"][name*="gender" i][value*="${targetVal.slice(0, 1)}" i]`,
  ];
  for (const sel of inputSelectors) {
    const loc = currentFrame.locator(sel).first();
    if (await loc.count().catch(() => 0) > 0) {
      const inputId = await loc.getAttribute('id').catch(() => null);
      if (inputId) {
        const lbl = currentFrame.locator(`label[for="${inputId}"]`).first();
        if (await lbl.count().catch(() => 0) > 0) {
          await lbl.scrollIntoViewIfNeeded().catch(() => {});
          await lbl.click({ timeout: 3000 }).catch(() => lbl.click({ force: true }));
          return;
        }
      }
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      await loc.click({ timeout: 3000 }).catch(() => loc.click({ force: true }));
      return;
    }
  }

  // 3. Quét label
  const labelLoc = currentFrame.locator(`label:has-text("${targetLabel}"), label:has-text("${targetAltLabel}")`).first();
  if (await labelLoc.count().catch(() => 0) > 0) {
    await labelLoc.scrollIntoViewIfNeeded().catch(() => {});
    await labelLoc.click({ timeout: 3000 }).catch(() => labelLoc.click({ force: true }));
    return;
  }

  // 4. Quét native select dropdown
  const selectLoc = currentFrame.locator('select[name*="gender" i], select[id*="gender" i], select[name*="sex" i]').first();
  if (await selectLoc.count().catch(() => 0) > 0) {
    await selectLoc.selectOption({ label: new RegExp(targetLabel, 'i') }, { timeout: 3000 })
      .catch(() => selectLoc.selectOption({ value: targetVal }, { timeout: 3000 }).catch(() => {}));
  }
}

/**
 * Chọn tiểu bang Hoa Kỳ (hỗ trợ cả mã CA/NY và tên California/New York, native select lẫn react-select/div).
 */
export async function handleTrySelectState(page, currentFrame, selector, stateValue) {
  const rawState = String(stateValue || '').trim();
  if (!rawState) return;
  const isCode = rawState.length === 2;
  const stateCode = isCode ? rawState.toUpperCase() : (Object.entries(US_STATES).find(([_, v]) => v.toLowerCase() === rawState.toLowerCase())?.[0] ?? rawState);
  const stateName = US_STATES[stateCode] || rawState;

  const { query, type } = parseSelectorString(selector);
  const container = type === 'xpath' ? currentFrame.locator(`xpath=${query}`).first() : currentFrame.locator(query).first();
  if (await container.count().catch(() => 0) === 0) return;

  const tagName = await container.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
  if (tagName === 'select') {
    await container.selectOption({ value: stateCode }, { timeout: 3000 })
      .catch(() => container.selectOption({ label: stateName }, { timeout: 3000 }))
      .catch(() => container.selectOption({ value: stateName }, { timeout: 3000 }))
      .catch(() => {});
    return;
  }

  // Custom div / react-select
  await container.scrollIntoViewIfNeeded().catch(() => {});
  await container.click({ timeout: 3000 }).catch(() => container.click({ force: true }));
  await delay(200);

  const inputInside = container.locator('input').first();
  if (await inputInside.count().catch(() => 0) > 0) {
    await inputInside.fill(stateName).catch(() => {});
    await delay(150);
    await inputInside.press('Enter').catch(() => {});
    return;
  }

  const menuOption = currentFrame.locator(`[role="option"]:has-text("${stateName}"), div[id*="option"]:has-text("${stateName}"), li:has-text("${stateName}")`).first();
  if (await menuOption.count().catch(() => 0) > 0) {
    await menuOption.click({ timeout: 3000 }).catch(() => menuOption.click({ force: true }));
  }
}

/**
 * Chọn tùy chọn trong Dropdown (native hoặc custom menu).
 */
export async function handleTrySelectOption(page, currentFrame, selector, targetValue) {
  const val = String(targetValue || '').trim();
  const { query, type } = parseSelectorString(selector);
  const container = type === 'xpath' ? currentFrame.locator(`xpath=${query}`).first() : currentFrame.locator(query).first();
  if (await container.count().catch(() => 0) === 0) return;

  const tagName = await container.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
  if (tagName === 'select') {
    await selectByValue(container, val);
    return;
  }

  // Custom container
  await container.scrollIntoViewIfNeeded().catch(() => {});
  await container.click({ timeout: 3000 }).catch(() => container.click({ force: true }));
  await delay(200);

  const optionLoc = currentFrame.locator(`[role="option"]:has-text("${val}"), div[id*="option"]:has-text("${val}"), li:has-text("${val}")`).first();
  if (await optionLoc.count().catch(() => 0) > 0) {
    await optionLoc.click({ timeout: 3000 }).catch(() => optionLoc.click({ force: true }));
  }
}

/**
 * Chọn Radio hoặc Checkbox theo văn bản hiển thị.
 */
export async function handleTrySelectRadioByText(page, currentFrame, selector, targetText) {
  const text = String(targetText || '').trim();
  if (!text) return;

  // 1. Nếu có selector chỉ định
  if (selector && selector !== 'auto') {
    const { query, type } = parseSelectorString(selector);
    const container = type === 'xpath' ? currentFrame.locator(`xpath=${query}`) : currentFrame.locator(query);
    const item = container.locator(`xpath=.//*[self::input or self::label][contains(text(), "${text}") or @value="${text}"]`).first();
    if (await item.count().catch(() => 0) > 0) {
      await item.scrollIntoViewIfNeeded().catch(() => {});
      await item.click({ timeout: 3000 }).catch(() => item.click({ force: true }));
      return;
    }
  }

  // 2. Tìm qua toàn bộ thẻ label
  const labels = await currentFrame.locator('label').all().catch(() => []);
  for (const label of labels) {
    const content = await label.textContent().catch(() => '');
    if (content?.toLowerCase().includes(text.toLowerCase())) {
      await label.scrollIntoViewIfNeeded().catch(() => {});
      await label.click({ timeout: 3000 }).catch(() => label.click({ force: true }));
      return;
    }
  }
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

  let currentFrame = page;

  for (const { cmd, arg } of steps) {
    const val = await sub(arg);
    logger?.({ type: 'script_step', detail: `{${cmd}}${val ? '=' + val.slice(0, 80) : ''}` });
    try {
      switch (cmd) {

        // ── No-op / Config Markers ───────────────────────────────────────
        case 'Note': case 'EmailConfig': case 'InfoConfig':
        case 'CheckTenOffer': case 'LoadTime': case 'ByPassReCaptchaCallback':
        case 'LoginGmail':
          break;

        // ── Chờ đợi ───────────────────────────────────────────────────────
        case 'Delay':
          await delay(parseDelayMs(val));
          break;

        case 'CheckPageLoaded':
        case 'CheckPageLoadedScript':
          await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
          await page.evaluate(() => typeof jQuery !== 'undefined' ? jQuery.active === 0 : true).catch(() => {});
          break;

        case 'DisplayEndXpath':
          if (val) await page.waitForSelector(`xpath=${val}`, { timeout: 15000 }).catch(() => {});
          break;

        case 'Check': {
          const [checkSelector, checkTimeout] = val.split('|');
          const ms = (parseFloat(checkTimeout) || 10) * 1000;
          if (checkSelector) {
            const loc = await resolveSmartLocator(page, currentFrame, checkSelector.trim());
            await loc.waitFor({ state: 'visible', timeout: ms }).catch(() => {});
          }
          break;
        }

        case 'CheckNoXpath': {
          const [noXpath, noTimeout] = val.split('|');
          const ms = (parseFloat(noTimeout) || 10) * 1000;
          if (noXpath) {
            await page.waitForSelector(`xpath=${noXpath.trim()}`, { state: 'hidden', timeout: ms }).catch(() => {});
          }
          break;
        }

        // ── Điều hướng & Cửa sổ ──────────────────────────────────────────
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

        case 'ClearCookie':
          await page.context().clearCookies().catch(() => {});
          break;

        // ── Điền Form — by Name ──────────────────────────────────────────
        case 'SendByName': {
          const [fName, fVal, fDelay] = val.split('|');
          const fieldVal = fVal != null ? await sub(fVal.trim()) : '';
          if (!fName?.trim()) break;
          const loc = currentFrame.locator(`[name="${fName.trim()}"]`).first();
          await handleTypeWithDelay(loc, fieldVal, fDelay);
          break;
        }

        // ── Điền Form — by ID ─────────────────────────────────────────────
        case 'SendById': {
          const [fId, fVal, fDelay] = val.split('|');
          const fieldVal = fVal != null ? await sub(fVal.trim()) : '';
          if (!fId?.trim()) break;
          const loc = currentFrame.locator(`#${fId.trim()}`).first();
          await handleTypeWithDelay(loc, fieldVal, fDelay);
          break;
        }

        // ── Điền Form — by Class ──────────────────────────────────────────
        case 'SendByClass': {
          const parts = val.split('|');
          let cls, idx, fieldVal, fDelay;
          if (parts.length >= 4) {
            [cls, idx, fieldVal, fDelay] = parts;
          } else if (parts.length === 3 && !isNaN(Number(parts[1]))) {
            [cls, idx, fieldVal] = parts;
          } else {
            [cls, fieldVal, fDelay] = parts; idx = '0';
          }
          fieldVal = fieldVal != null ? await sub(fieldVal.trim()) : '';
          if (!cls?.trim()) break;
          const loc = currentFrame.locator(`.${cls.trim()}`).nth(Number(idx) || 0);
          await handleTypeWithDelay(loc, fieldVal, fDelay);
          break;
        }

        // ── Điền Form — by XPath ──────────────────────────────────────────
        case 'SendByXpath': {
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

        case 'SendKeyEnterByXpath': {
          const xp = val.trim();
          if (!xp) break;
          const loc = currentFrame.locator(`xpath=${xp}`).first();
          await loc.press('Enter', { timeout: 5000 }).catch(() => {});
          break;
        }

        // ── Click Thông Minh & Click Chuẩn ───────────────────────────────
        case 'SmartClick': {
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
        case 'ClickXpath': {
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
        case 'ClickRandomDisplayXpath': {
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

        case 'ClickAllRadioXpath': {
          if (!val) break;
          const radios = await currentFrame.locator(`xpath=${val.trim()}`).all().catch(() => []);
          for (const radio of radios) {
            await executeSmartClick(page, radio, 1);
            await delay(randInt(100, 300));
          }
          break;
        }

        case 'ClickRadioRandomXpath': {
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
        case 'GenderSelect': {
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

        case 'TrySelectState': {
          // Syntax: {TrySelectState}=Selector
          await handleTrySelectState(page, currentFrame, val.trim(), vars.State);
          break;
        }

        case 'TrySelectOption': {
          // Syntax: {TrySelectOption}=Selector|value
          const pipeIdx = val.indexOf('|');
          if (pipeIdx !== -1) {
            await handleTrySelectOption(page, currentFrame, val.slice(0, pipeIdx).trim(), val.slice(pipeIdx + 1).trim());
          } else {
            await handleTrySelectOption(page, currentFrame, 'select', val.trim());
          }
          break;
        }

        case 'TrySelectRadioByText': {
          // Syntax: {TrySelectRadioByText}=Selector|value hoặc {TrySelectRadioByText}=value
          const pipeIdx = val.indexOf('|');
          if (pipeIdx !== -1) {
            await handleTrySelectRadioByText(page, currentFrame, val.slice(0, pipeIdx).trim(), val.slice(pipeIdx + 1).trim());
          } else {
            await handleTrySelectRadioByText(page, currentFrame, 'auto', val.trim());
          }
          break;
        }

        case 'SelectOptionValueXpath': {
          const parts = val.split('|');
          if (parts[0]) await selectByValue(currentFrame.locator(`xpath=${parts[0].trim()}`).first(), parts[1]?.trim() ?? '');
          break;
        }
        case 'SelectOptionValueId': {
          const parts = val.split('|');
          if (parts.length >= 2) await selectByValue(currentFrame.locator(`#${parts[0].trim()}`).first(), parts[1].trim());
          break;
        }
        case 'SelectOptionValueClass': {
          const parts = val.split('|');
          if (parts.length >= 2) await selectByValue(currentFrame.locator(`.${parts[0].trim()}`).first(), parts[1].trim());
          break;
        }

        case 'SelectOptionIndexXpath': {
          const parts = val.split('|');
          if (parts.length >= 2) await selectByIndex(currentFrame.locator(`xpath=${parts[0].trim()}`).first(), parts[1].trim());
          break;
        }
        case 'SelectOptionIndexId': {
          const parts = val.split('|');
          if (parts.length >= 2) await selectByIndex(currentFrame.locator(`#${parts[0].trim()}`).first(), parts[1].trim());
          break;
        }
        case 'SelectOptionIndexClass': {
          const parts = val.split('|');
          if (parts.length >= 2) await selectByIndex(currentFrame.locator(`.${parts[0].trim()}`).first(), parts[1].trim());
          break;
        }

        case 'SelectOptionTextXpath': {
          const parts = val.split('|');
          if (parts.length >= 2) await selectByText(currentFrame.locator(`xpath=${parts[0].trim()}`).first(), parts[1].trim());
          break;
        }
        case 'SelectOptionTextId': {
          const parts = val.split('|');
          if (parts.length >= 2) await selectByText(currentFrame.locator(`#${parts[0].trim()}`).first(), parts[1].trim());
          break;
        }
        case 'SelectOptionTextClass': {
          const parts = val.split('|');
          if (parts.length >= 2) await selectByText(currentFrame.locator(`.${parts[0].trim()}`).first(), parts[1].trim());
          break;
        }

        case 'SelectOptionRandomXpath': {
          if (val) {
            const loc = currentFrame.locator(`xpath=${val.trim()}`).first();
            await selectRandom(loc);
          }
          break;
        }

        // ── JavaScript ───────────────────────────────────────────────────
        case 'JS':
          if (val) await page.evaluate(val).catch((e) => {
            logger?.({ type: 'script_warn', detail: `{JS}: ${e.message}` });
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
