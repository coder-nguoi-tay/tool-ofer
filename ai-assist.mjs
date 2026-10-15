/**
 * AI fallback khi autofill bị kẹt: gọi `agt` CLI, đọc HTML trang, thực thi actions cho đến khi không còn form.
 *
 * @module ai-assist
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */

import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MAX_ROUNDS = 20;
const AGT_TIMEOUT_MS = 60_000;

/**
 * Đường dẫn hoặc tên binary của agt CLI.
 * Tự động mở rộng PATH để nhận diện ~/.local/bin, /opt/homebrew/bin, /usr/local/bin.
 */
function getAgtSpawnConfig() {
  const agtBin = process.env.AGT_BIN || 'agt';
  const augmentedPath = [
    join(homedir(), '.local', 'bin'),
    join(homedir(), '.gemini', 'antigravity-cli', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    process.env.PATH || '',
  ].filter(Boolean).join(':');

  return {
    bin: agtBin,
    env: { ...process.env, PATH: augmentedPath },
  };
}

/**
 * Gọi `agt` CLI với prompt, trả về text output.
 *
 * @param {string} prompt Nội dung truyền vào stdin của agt.
 * @return {Promise<string>} Output từ agt.
 */
export function callAgt(prompt) {
  return new Promise((resolve, reject) => {
    const { bin, env } = getAgtSpawnConfig();
    const child = spawn(bin, [], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('agt timeout (quá 60s)'));
    }, AGT_TIMEOUT_MS);

    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !out.trim()) {
        reject(new Error(`agt exited ${code}: ${err.slice(0, 200)}`));
      } else {
        resolve(out);
      }
    });

    child.on('error', (e) => {
      clearTimeout(timer);
      if (e.code === 'ENOENT') {
        reject(new Error('agt CLI không có trong PATH. Bỏ qua tầng AI.'));
      } else {
        reject(e);
      }
    });

    try {
      child.stdin.write(prompt);
      child.stdin.end();
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}

/**
 * Parse JSON actions từ output của agt, chịu được markdown code block và text thừa xung quanh.
 *
 * @param {string} raw Raw output từ agt.
 * @return {Array<{action:string,selector?:string,value?:string}>} Mảng actions.
 */
export function parseActions(raw) {
  if (!raw || typeof raw !== 'string') return [];

  // 1. Thử trích xuất khối ```json [ ... ] ``` nếu có
  const codeBlockMatch = raw.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/i);
  const target = codeBlockMatch ? codeBlockMatch[1] : raw;

  // 2. Trích xuất mảng JSON [ ... ]
  const arrayMatch = target.match(/\[\s*\{[\s\S]*\}\s*\]|\[\s*\]/);
  if (!arrayMatch) return [];

  try {
    const parsed = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((act) => act && typeof act === 'object' && typeof act.action === 'string');
  } catch {
    return [];
  }
}

/**
 * Kiểm tra trang còn form, ô nhập liệu chưa điền hoặc nút submit chưa bấm hay không.
 *
 * @param {object} page Playwright page.
 * @return {Promise<boolean>} true nếu còn việc phải làm.
 */
export async function pageHasWork(page) {
  try {
    if (!page || (typeof page.isClosed === 'function' && page.isClosed())) return false;
    return await page.evaluate(() => {
      // 1. Ô nhập liệu (input, textarea, select) chưa có dữ liệu hợp lệ
      const hasUnfilledInput = Array.from(document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]), textarea, select'
      )).some((el) => {
        if (el.disabled || el.readOnly) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
        if (el.getAttribute('data-autolead-filled') === '1' || el.getAttribute('data-autolead-ai-done') === '1') return false;

        const val = (el.value || '').trim();
        const isPlaceholderMask = /^(\+1|\+1\s*|\(___\)\s*___-____|___-__-____|[_\-\(\)\s\.\/]+|mm\/dd\/yyyy)$/i.test(val);
        return val === '' || isPlaceholderMask;
      });

      if (hasUnfilledInput) return true;

      // 2. Ô checkbox điều khoản bắt buộc chưa được tích
      const hasUncheckedConsent = Array.from(document.querySelectorAll('input[type="checkbox"]')).some((el) => {
        if (el.disabled || el.checked) return false;
        const meta = `${el.id} ${el.name} ${el.className} ${el.getAttribute('data-tf-element-role') || ''}`;
        return /consent|terms|agree|privacy|disclosure/i.test(meta) || el.required;
      });

      if (hasUncheckedConsent) return true;

      // 3. Câu hỏi khảo sát / lựa chọn chưa click
      const hasUnclickedSurvey = Array.from(document.querySelectorAll(
        'button.btn-option:not([data-autolead-clicked="1"]), [data-vector-answer="true"]:not([data-autolead-clicked="1"]), [data-element-type="survey_answer"]:not([data-autolead-clicked="1"])'
      )).some((el) => !el.disabled && (el.offsetWidth > 0 || el.offsetHeight > 0));

      if (hasUnclickedSurvey) return true;

      // 4. Nút gửi/tiếp tục đang hiển thị và chưa bấm
      const hasSubmit = Array.from(document.querySelectorAll(
        'button[type="submit"], input[type="submit"], [data-vector-submit="true"], button.continue-btn, button.submit-btn'
      )).some((el) => {
        if (el.disabled) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
        return (el.offsetWidth > 0 || el.offsetHeight > 0);
      });

      return hasSubmit;
    }).catch(() => false);
  } catch {
    return false;
  }
}

/**
 * Thực thi một action trả về từ agt lên trang Playwright.
 *
 * @param {object} page Playwright page.
 * @param {{action:string,selector?:string,value?:string}} act Action cần thực thi.
 * @param {object} [session=null] Phiên session để tăng số trường đã điền.
 * @return {Promise<void>}
 */
export async function executeAction(page, act, session = null) {
  const { action, selector, value } = act;
  if (!selector) return;

  const locator = page.locator(selector).first();
  const visible = await locator.isVisible({ timeout: 2000 }).catch(() => false);
  if (!visible) return;

  if (action === 'fill' || action === 'type') {
    await locator.click({ force: true, timeout: 1500 }).catch(() => {});
    await locator.fill(String(value ?? ''), { force: true, timeout: 3000 }).catch(async () => {
      await locator.pressSequentially(String(value ?? ''), { delay: 25 }).catch(() => {});
    });
    await locator.evaluate((el) => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      el.setAttribute('data-autolead-ai-done', '1');
      el.setAttribute('data-autolead-filled', '1');
    }).catch(() => {});
    if (session) session.autofillFields = (session.autofillFields || 0) + 1;
  } else if (action === 'click') {
    await locator.click({ force: true, timeout: 2500 }).catch(async () => {
      await locator.evaluate((el) => el.click()).catch(() => {});
    });
    await locator.evaluate((el) => {
      el.setAttribute('data-autolead-clicked', '1');
      el.setAttribute('data-autolead-ai-done', '1');
    }).catch(() => {});
    if (session) session.autofillFields = (session.autofillFields || 0) + 1;
  } else if (action === 'select') {
    await locator.selectOption(String(value ?? ''), { force: true, timeout: 2000 }).catch(async () => {
      await locator.selectOption({ label: String(value ?? '') }, { force: true, timeout: 1000 }).catch(() => {});
    });
    await locator.evaluate((el) => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.setAttribute('data-autolead-ai-done', '1');
      el.setAttribute('data-autolead-filled', '1');
    }).catch(() => {});
    if (session) session.autofillFields = (session.autofillFields || 0) + 1;
  } else if (action === 'check') {
    await locator.check({ force: true, timeout: 1500 }).catch(async () => {
      await locator.click({ force: true, timeout: 1000 }).catch(() => {});
    });
    await locator.evaluate((el) => {
      el.setAttribute('data-autolead-ai-done', '1');
      el.setAttribute('data-autolead-filled', '1');
    }).catch(() => {});
    if (session) session.autofillFields = (session.autofillFields || 0) + 1;
  }
}

/**
 * Chạy vòng lặp AI assist: gọi agt, thực thi actions, lặp đến khi không còn form.
 *
 * @param {object} page Playwright page đang kẹt.
 * @param {object} record Bản ghi autofill đang dùng cho phiên này.
 * @param {object} session Session object để log.
 * @return {Promise<void>}
 */
export async function runAiAssist(page, record, session) {
  if (session.aiAssistRunning) return;
  session.aiAssistRunning = true;

  const slotNum = (session.tileIndex ?? 0) + 1;
  console.log(`[AI-Assist] Slot ${slotNum}: bắt đầu hỗ trợ AI cho trang ${page.url()}`);

  try {
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      if (page.isClosed()) break;

      const stillHasWork = await pageHasWork(page);
      if (!stillHasWork) {
        console.log(`[AI-Assist] Slot ${slotNum}: trang không còn form/submit, dừng.`);
        break;
      }

      const html = await page.content().catch(() => '');
      if (!html) break;

      // Cắt HTML để không quá dài (giữ tối đa 120KB theo đặc tả)
      const trimmedHtml = html.length > 120_000 ? html.slice(0, 120_000) + '...[truncated]' : html;

      const recordJson = JSON.stringify(record ?? {});
      const prompt = `Bạn là agent tự động điền form web.
URL: ${page.url()}
Thông tin cần điền: ${recordJson}
Vòng: ${round}/${MAX_ROUNDS}

Nhiệm vụ: phân tích HTML bên dưới và trả về JSON array các action để điền form hoặc click nút tiếp theo.
Chỉ trả về JSON array, không giải thích thêm.
Format mỗi action:
- Điền input/textarea: {"action":"fill","selector":"CSS_SELECTOR","value":"GIÁ_TRỊ"}
- Chọn dropdown: {"action":"select","selector":"CSS_SELECTOR","value":"GIÁ_TRỊ"}
- Tích checkbox: {"action":"check","selector":"CSS_SELECTOR"}
- Bấm nút: {"action":"click","selector":"CSS_SELECTOR"}
Nếu không còn form hoặc nút submit nào cần xử lý, trả về: []

HTML:
${trimmedHtml}`;

      let actions = [];
      try {
        const raw = await callAgt(prompt);
        actions = parseActions(raw);
        console.log(`[AI-Assist] Slot ${slotNum} round ${round}: agt trả ${actions.length} action(s)`);
      } catch (err) {
        console.warn(`[AI-Assist] Slot ${slotNum} round ${round}: cảnh báo agt — ${err.message}`);
        // Nếu agt không có trong PATH hoặc lỗi → bỏ qua, không crash
        break;
      }

      if (actions.length === 0) {
        console.log(`[AI-Assist] Slot ${slotNum}: agt báo xong ([] trả về).`);
        break;
      }

      for (const act of actions) {
        if (page.isClosed()) break;
        try {
          await executeAction(page, act, session);
          await new Promise((r) => setTimeout(r, 300));
        } catch {
          // Action lỗi → bỏ qua, tiếp tục action kế
        }
      }

      // Chờ trang load ổn định (800ms)
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 800));
    }
  } finally {
    session.aiAssistRunning = false;
    console.log(`[AI-Assist] Slot ${slotNum}: kết thúc hỗ trợ AI.`);
  }
}
