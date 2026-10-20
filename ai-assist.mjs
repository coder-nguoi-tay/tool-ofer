/**
 * AI fallback khi autofill bị kẹt: gọi `agy` CLI, đọc HTML trang, thực thi actions cho đến khi không còn form.
 *
 * @module ai-assist
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */

import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { humanType } from './autofill.mjs';

const MAX_ROUNDS = 20;
const AGT_TIMEOUT_MS = 90_000;
const MAX_CONCURRENT_AI = 100; // tối đa 100 lượt gọi AI trên mọi engine đồng thời
const CODEX_MODEL = 'gpt-5.6-luna';
const CODEX_REASONING_EFFORT = 'none';
let runningAiCount = 0;
const aiConcurrencyWaiters = [];

/**
 * Chờ đến lượt chạy AI để giới hạn tải chung giữa Codex MCP và CLI.
 * @return {Promise<void>} Hoàn tất khi đã giữ được một lượt chạy AI.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
async function acquireAiConcurrencySlot() {
  if (runningAiCount < MAX_CONCURRENT_AI) {
    runningAiCount += 1;
    return;
  }
  await new Promise((resolve) => aiConcurrencyWaiters.push(resolve));
}

/**
 * Trả lượt chạy AI cho yêu cầu đang chờ tiếp theo.
 * @return {void} Không trả dữ liệu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
function releaseAiConcurrencySlot() {
  const nextWaiter = aiConcurrencyWaiters.shift();
  if (nextWaiter) nextWaiter();
  else runningAiCount = Math.max(0, runningAiCount - 1);
}

/**
 * Phát hiện màn Take the Deal và đóng các trình duyệt phụ của phiên.
 * @param {object} page Trang Playwright đang được AI xử lý.
 * @param {object} session Phiên trình duyệt đang giữ trang hiện tại.
 * @param {Function} addLog Hàm ghi log của luồng AI.
 * @return {Promise<boolean>} True nếu trang đang ở màn Take the Deal.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
async function prepareTakeDealStage(page, session, addLog) {
  const isTakeDealStage = await page.evaluate(() => /\btake\s+the\s+deal\b/i.test(document.body?.innerText || '')).catch(() => false);
  if (!isTakeDealStage) return false;

  if (!session._takeDealAuxiliaryClosePromise && typeof session.closeAuxiliaryBrowsers === 'function') {
    session._takeDealAuxiliaryClosePromise = Promise.resolve()
      .then(() => session.closeAuxiliaryBrowsers())
      .catch((error) => ({ failed: 1, error: error.message }));
  }

  if (session._takeDealAuxiliaryClosePromise) {
    const result = await session._takeDealAuxiliaryClosePromise;
    addLog({
      time: new Date().toISOString(),
      type: 'ai_take_deal_cleanup',
      detail: `[AI Assist] Đã đóng ${result?.closed ?? 0} trình duyệt phụ trước bước Take the Deal${result?.failed ? `; ${result.failed} lỗi` : ''}.`,
    });
  }
  return true;
}

export let globalAiConfig = {
  enabled: true,
  mode: 'auto_on_stuck', // 'auto_on_stuck' | 'continuous' | 'heuristic_only' | 'disabled'
  cliBinary: 'agy',
  useCodexMcp: true, // Tận dụng OpenAI Codex SDK + Playwright MCP khi chạy trên AdsPower
  maxRounds: 20,
  timeoutSeconds: 90,
  solveBotQuiz: true,
  solveSurveyCards: true,
  clickJumpPage: true,
  multiStepSubmit: true,
  syncAutofill: true,
  customInstructions: '',
};

export function setGlobalAiConfig(cfg = {}) {
  globalAiConfig = { ...globalAiConfig, ...cfg };
}

/**
 * Rút gọn và làm sạch HTML chỉ giữ lại cấu trúc tương tác (form, input, button, label, text)
 * Loại bỏ toàn bộ script, style, svg, noscript, comments và inline base64 để AI phân tích
 * siêu nhanh, tránh timeout (giảm dung lượng từ >120KB xuống <15KB mà vẫn đủ 100% ngữ cảnh).
 *
 * @param {string} html Raw HTML của trang.
 * @return {string} HTML đã được làm sạch và thu gọn.
 */
export function extractCleanPageStructure(html) {
  if (!html || typeof html !== 'string') return '';

  let cleaned = html
    // 1. Xóa toàn bộ thẻ script, style, svg, noscript, audio, video, canvas, iframe
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    .replace(/<canvas\b[^<]*(?:(?!<\/canvas>)<[^<]*)*<\/canvas>/gi, '')
    // 2. Xóa comment HTML
    .replace(/<!--[\s\S]*?-->/g, '')
    // 3. Xóa dữ liệu base64 dài (data:image/..., data:font/...)
    .replace(/data:[^;]+;base64,[a-zA-Z0-9+/=]+/g, 'data:stripped')
    // 4. Thu gọn whitespace thừa
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n');

  // Giới hạn tối đa 60KB cho AI prompt (đã quá đủ cho mọi form web phức tạp nhất)
  if (cleaned.length > 60_000) {
    cleaned = cleaned.slice(0, 60_000) + '\n<!-- [TRUNCATED] -->';
  }

  return cleaned.trim();
}

/**
 * Đường dẫn hoặc tên binary của codex / agy CLI.
 * Tự động mở rộng PATH để nhận diện ~/.local/bin, /opt/homebrew/bin, /usr/local/bin.
 */
export function getAgtSpawnConfig(customBin = null) {
  let codexBin = customBin || globalAiConfig.cliBinary || process.env.CODEX_BIN || 'codex';
  if (codexBin === 'codex_mcp') codexBin = 'codex';
  const augmentedPath = [
    join(homedir(), '.local', 'bin'),
    join(homedir(), '.gemini', 'antigravity-cli', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    process.env.PATH || '',
  ].filter(Boolean).join(':');

  return {
    bin: codexBin,
    env: { ...process.env, PATH: augmentedPath },
  };
}

/**
 * Gọi `codex` hoặc `agy` CLI với prompt, trả về text output.
 *
 * @param {string} prompt Nội dung truyền vào stdin của codex/agy.
 * @param {object} [options={}] Tùy chọn CLI và timeout.
 * @return {Promise<string>} Output từ AI CLI.
 * @throws {Error} Khi CLI timeout hoặc kết thúc với mã lỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
export function callAgt(prompt, options = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = (options.timeoutSeconds || globalAiConfig.timeoutSeconds || 90) * 1000;
    const { bin, env } = getAgtSpawnConfig(options.cliBinary);
    const isCodex = bin.includes('codex');
    const args = isCodex
      ? ['exec', '--model', CODEX_MODEL, '--config', `model_reasoning_effort="${CODEX_REASONING_EFFORT}"`, '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '--ephemeral', '--json', '-']
      : [];

    const child = spawn(bin, args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${bin} timeout (quá ${timeoutMs / 1000}s)`));
    }, timeoutMs);

    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !out.trim()) {
        reject(new Error(`${bin} exited ${code}: ${err.slice(0, 200)}`));
        return;
      }
      if (isCodex) {
        // Parse JSONL: gom tất cả item.completed[agent_message].text
        const text = out.split('\n')
          .map((line) => { try { return JSON.parse(line); } catch { return null; } })
          .filter((ev) => ev?.type === 'item.completed' && ev?.item?.type === 'agent_message')
          .map((ev) => ev.item.text)
          .join('\n');
        resolve(text || out);
      } else {
        resolve(out);
      }
    });

    child.on('error', (e) => {
      clearTimeout(timer);
      if (e.code === 'ENOENT') {
        reject(new Error(`${bin} CLI không có trong PATH. Bỏ qua tầng AI.`));
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
 * Parse JSON actions từ output của agy, chịu được markdown code block và text thừa xung quanh.
 *
 * @param {string} raw Raw output từ agy.
 * @return {Array<{action:string,selector?:string,value?:string}>} Mảng actions.
 */
export function parseActions(raw) {
  if (!raw || typeof raw !== 'string') return [];

  // 1. Thử trích xuất khối ```json [ ... ] ``` hoặc ```json { ... } ``` nếu có
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\[\{][\s\S]*?[\]\}])\s*```/i);
  const target = codeBlockMatch ? codeBlockMatch[1] : raw;

  // 2. Thử trích xuất mảng JSON [ ... ]
  const arrayMatch = target.match(/\[\s*\{[\s\S]*\}\s*\]|\[\s*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.filter((act) => act && typeof act === 'object' && typeof act.action === 'string');
      }
    } catch {}
  }

  // 3. Fallback: Nếu trả về single object { "action": "..." }
  const objectMatch = target.match(/\{\s*"action"\s*:\s*"[\s\S]*?\}/);
  if (objectMatch) {
    try {
      const parsed = JSON.parse(objectMatch[0]);
      if (parsed && typeof parsed.action === 'string') {
        return [parsed];
      }
    } catch {}
  }

  return [];
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
      if (!document.body || document.body.children.length === 0) return false;

      const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
        return Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      };

      // 0. Trang cảm ơn / hoàn tất không còn form nào cần làm
      const pageText = (document.body.innerText || '').toLowerCase();
      const pageUrl = (window.location.href || '').toLowerCase();
      const isThankYou = /thank\s*you|congratulations|confirmed|your\s*submission|application\s*received|cảm ơn/i.test(pageText) ||
        /thank[-_]?you|confirmation|success|completed|receipt/i.test(pageUrl);
      const anyForm = document.querySelector('form, [role="form"], .form, .form-container, .survey-container, .quiz-container, [data-form], .input-container, div.input, div.button, .btn-option');
      const anySubmitBtn = document.querySelector('button[type="submit"], input[type="submit"], [data-vector-submit="true"], button.continue-btn, button.submit-btn, .btn-option, div.btn-option, div.button, .cta-button');
      if (isThankYou && !anyForm && !anySubmitBtn) {
        return false;
      }

      // 1. Ô nhập liệu (input, textarea, select) chưa có dữ liệu hợp lệ
      const hasUnfilledInput = Array.from(document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]), textarea, select'
      )).some((el) => {
        if (el.disabled || el.readOnly) return false;
        if (!isVisible(el)) return false;
        if (el.getAttribute('data-ux-ai-done') === '1') return false;

        const val = (el.value || '').trim();
        const isPlaceholderMask = /^(\+1|\+1\s*|\(___\)\s*___-____|___-__-____|[_\-\(\)\s\.\/]+|mm\/dd\/yyyy)$/i.test(val);
        return val === '' || isPlaceholderMask;
      });

      if (hasUnfilledInput) return true;

      // 2. Ô checkbox điều khoản bắt buộc chưa được tích (kể cả trong thẻ div hoặc ngoài form)
      const hasUncheckedConsent = Array.from(document.querySelectorAll('input[type="checkbox"], [role="checkbox"], .custom-checkbox')).some((el) => {
        if (el.disabled || el.checked || el.getAttribute('aria-checked') === 'true') return false;
        const parent = el.closest('label, div, li, .form-check, .checkbox') || el;
        const text = `${el.id} ${el.name} ${el.className} ${el.getAttribute('data-tf-element-role') || ''} ${parent ? parent.innerText || '' : ''}`;
        return /consent|terms|agree|privacy|disclosure|tcpa|condition|policy|confirm|accept|must|required|mandatory|continue/i.test(text) || el.required || el.getAttribute('aria-required') === 'true';
      });

      if (hasUncheckedConsent) return true;

      // 3. Nhóm radio buttons (<input type="radio">) chưa chọn phương án nào
      const radioGroups = {};
      const radios = Array.from(document.querySelectorAll('input[type="radio"]')).filter((el) => {
        if (el.disabled) return false;
        if (isVisible(el)) return true;
        const parent = el.closest('label, div, li');
        return parent ? isVisible(parent) : false;
      });
      radios.forEach((r) => {
        const g = r.name || r.id || 'unnamed_radio_group';
        if (!radioGroups[g]) radioGroups[g] = [];
        radioGroups[g].push(r);
      });
      const hasUncheckedRadioGroup = Object.values(radioGroups).some((group) => !group.some((r) => r.checked));
      if (hasUncheckedRadioGroup) return true;

      // 4. Câu hỏi khảo sát / quiz cards / lựa chọn chưa click hoặc chưa hoàn thành (bao gồm link thẻ <a> nhảy trang)
      const surveyCandidates = Array.from(document.querySelectorAll([
        '[id="btn-option"]:not(.active):not(.selected)',
        '[id^="btn-option"]:not(.active):not(.selected)',
        '[id*="btn-option"]:not(.active):not(.selected)',
        '.btn-option:not(.active):not(.selected)',
        'button.btn-option:not(.active):not(.selected)',
        'a.btn-option:not(.active):not(.selected)',
        'a.choice:not(.active):not(.selected)',
        'a.choice-btn:not(.active):not(.selected)',
        'a.option-btn:not(.active):not(.selected)',
        'a.answer-btn:not(.active):not(.selected)',
        'a.quiz-btn:not(.active):not(.selected)',
        'a.creative-survey-answer:not(.selected)',
        'a[data-vector-answer="true"]:not(.active)',
        'a[data-choice]:not(.active)',
        'a[data-answer]:not(.active)',
        'a[data-option]:not(.active)',
        '.choices a:not(.active)',
        '.answers a:not(.active)',
        '.options a:not(.active)',
        '.survey-question a:not(.active)',
        '.question a:not(.active)',
        '.choice-container a:not(.active)',
        '[data-vector-answer="true"]:not(.active):not(.selected)',
        '[data-element-type="survey_answer"]:not(.active):not(.selected)',
        '[role="radio"]:not([aria-checked="true"])',
        '.option-btn:not(.active):not(.selected)',
        '.choice-btn:not(.active):not(.selected)',
        '.quiz-btn:not(.active):not(.selected)',
        '.answer-btn:not(.active):not(.selected)',
        'label.btn:not(.active)',
        '.choice-container [role="button"]:not(.active)',
        '.options-container a:not(.active)',
        '.creative-survey-answer:not(.selected)',
      ].join(', '))).filter((el) => !el.disabled && isVisible(el));

      if (surveyCandidates.length > 0) return true;

      // 5. Nút gửi/tiếp tục/bước tiếp theo đang hiển thị và chưa bấm (bao gồm cả Jump Page màn 5 / Reward)
      const submitCandidates = Array.from(document.querySelectorAll([
        '#btnSubmit',
        '#btnNext',
        '#btnContinue',
        'button[type="submit"]',
        'input[type="submit"]',
        '[data-vector-submit="true"]',
        'button.continue-btn',
        'button.submit-btn',
        'button.next-btn',
        'button.primary-btn',
        'button.cta-button',
        'button.rjp-cta-button',
        'button.sjp-cta-button',
        '.btn-submit',
        '.btn-next',
        '.btn-continue',
        'div.continue-btn',
        'div.btn-next',
        'a.forward-step',
        'a.cta-button',
        'a.rjp-cta-button',
        'a.sjp-cta-button',
        '.cta-button',
        '.rjp-cta-button',
        '.sjp-cta-button',
        'a[href*="/next"]',
        'a[aria-label*="Reward" i]',
        'a[aria-label*="Get My" i]',
        'button',
        'a[role="button"]',
        'a.btn',
        'a.button',
        'div.btn-option',
        'div.button',
        'div.btn',
        '[id="btn-option"]',
        '[id*="btn-option"]',
        '.btn-option',
        'div[class*="btn-option"]',
        'div[class*="button"]',
      ].join(', '))).some((el) => {
        if (el.disabled) return false;
        if (!isVisible(el)) return false;
        if (el.getAttribute('data-ux-clicked') === '1') return false;

        if (el.type === 'submit' || el.getAttribute('data-vector-submit') === 'true' || /submit|continue|next|cta-button|rjp-cta/i.test(el.className) || (el.tagName === 'A' && el.href && el.href.includes('/next'))) {
          return true;
        }

        const text = (el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || '').trim().toLowerCase();
        return /^(continue|next|submit|proceed|start|get\s*quote|see\s*my\s*options|view\s*results|get\s*my\s*reward|claim\s*reward|claim\s*my\s*reward|get\s*reward|view\s*deals|unlock|tiếp\s*tục|xem\s*kết\s*quả|bước\s*tiếp|gửi)/i.test(text);
      });

      if (submitCandidates) return true;

      // 6. Có form hoặc container nhập liệu (div chứa input, class .input, .btn-option) đang hiển thị
      const hasActiveFormOrInputs = Array.from(document.querySelectorAll(
        'form, [role="form"], .form, .form-container, .survey-container, .quiz-container, [data-form], div.input, div.button, .btn-option'
      )).some((f) => isVisible(f)) ||
      Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea, [role="checkbox"], [role="radio"]')).some((el) => isVisible(el) && !el.disabled);
      return hasActiveFormOrInputs;
    }).catch(() => false);
  } catch {
    return false;
  }
}

/**
 * Thực thi một action trả về từ agy lên trang Playwright.
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
  const count = typeof locator.count === 'function' ? await locator.count().catch(() => 0) : 1;
  if (count === 0) return;

  let visible = await locator.isVisible({ timeout: 2000 }).catch(() => false);
  if (!visible) {
    // Nếu là checkbox hoặc radio, kiểm tra xem label hoặc wrapper có hiển thị không
    visible = await locator.evaluate((el) => {
      const isInput = el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio');
      if (!isInput) return false;
      const parent = el.closest('label, div, li');
      if (!parent) return false;
      const style = window.getComputedStyle ? window.getComputedStyle(parent) : null;
      if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
      return Boolean(parent.offsetWidth || parent.offsetHeight || parent.getClientRects().length);
    }).catch(() => false);
  }
  if (!visible) return;

  if (action === 'fill' || action === 'type') {
    let fillValue = String(value ?? '');
    if (session?.assignedEmail && (/email|mail/i.test(selector) || /@/.test(fillValue))) {
      fillValue = session.assignedEmail;
    }
    await humanType(locator, fillValue, page);
    await locator.evaluate((el) => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      el.setAttribute('data-ux-ai-done', '1');
      el.setAttribute('data-ux-filled', '1');
    }).catch(() => {});
    if (session) {
      session.autofillFields = (session.autofillFields || 0) + 1;
      session.lastActionTime = Date.now();
    }
  } else if (action === 'click') {
    if (typeof locator.click === 'function') {
      await locator.click({ force: true, timeout: 2500 }).catch(async () => {
        if (typeof locator.evaluate === 'function') {
          await locator.evaluate((el) => el.click()).catch(() => {});
        }
      });
    } else if (typeof locator.evaluate === 'function') {
      await locator.evaluate((el) => el.click()).catch(() => {});
    }
    await locator.evaluate((el) => {
      el.setAttribute('data-ux-clicked', '1');
      el.setAttribute('data-ux-ai-done', '1');
      el.classList.add('active', 'selected');
      // Nếu là checkbox hoặc radio, luôn đảm bảo checked = true
      if (el.type === 'checkbox' || el.type === 'radio') {
        el.checked = true;
        if (typeof el.setAttribute === 'function') el.setAttribute('aria-checked', 'true');
      } else {
        const innerCheck = el.querySelector('input[type="checkbox"], input[type="radio"]');
        if (innerCheck) {
          innerCheck.checked = true;
          if (typeof innerCheck.setAttribute === 'function') innerCheck.setAttribute('aria-checked', 'true');
        }
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      // Nếu là thẻ A Jump Page (/next hoặc link chuyển tiếp), hỗ trợ điều hướng thẳng nếu click chưa chuyển
      if (el.tagName === 'A' && el.href && !el.href.startsWith('javascript:')) {
        try { window.location.href = el.href; } catch {}
      }
    }).catch(() => {});
    if (session) {
      session.autofillFields = (session.autofillFields || 0) + 1;
      session.lastActionTime = Date.now();
    }
  } else if (action === 'select') {
    await locator.selectOption(String(value ?? ''), { force: true, timeout: 2000 }).catch(async () => {
      await locator.selectOption({ label: String(value ?? '') }, { force: true, timeout: 1000 }).catch(() => {});
    });
    await locator.evaluate((el) => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.setAttribute('data-ux-ai-done', '1');
      el.setAttribute('data-ux-filled', '1');
    }).catch(() => {});
    if (session) {
      session.autofillFields = (session.autofillFields || 0) + 1;
      session.lastActionTime = Date.now();
    }
  } else if (action === 'check') {
    await locator.check({ force: true, timeout: 2000 }).catch(async () => {
      await locator.click({ force: true, timeout: 1000 }).catch(async () => {
        await locator.evaluate((el) => {
          el.checked = true;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }).catch(() => {});
      });
    });
    await locator.evaluate((el) => {
      el.setAttribute('data-ux-ai-done', '1');
      el.setAttribute('data-ux-filled', '1');
      el.checked = true;
      if (typeof el.setAttribute === 'function') {
        el.setAttribute('aria-checked', 'true');
      }
      el.classList?.add('checked', 'active');
      const label = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
      if (label && label !== el) {
        try { label.click(); } catch {}
      }
      try {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {}
    }).catch(() => {});
    if (session) {
      session.autofillFields = (session.autofillFields || 0) + 1;
      session.lastActionTime = Date.now();
    }
  }
}

/**
 * Phát hiện action cứu hộ tự động trên trang khi AI trả về [] hoặc từ chối thực hiện.
 * Quét theo thứ tự ưu tiên:
 * 1. Câu hỏi trắc nghiệm logic / bot-detection (chó sủa "Woof", mèo kêu "Meow", phép tính, v.v.)
 * 2. Nút câu hỏi khảo sát / quiz buttons (btn-option, choice-btn, option-btn)
 * 3. Nút nhận thưởng Jump Page (.cta-button, .rjp-cta-button, /next)
 * 4. Nút bấm tiếp tục / submit (button[type="submit"], button.continue-btn, #btnNext, #btnSubmit)
 *
 * @param {object} page Playwright page.
 * @param {object} [config=null] Cấu hình AI tuỳ biến.
 * @return {Promise<{action:string,selector:string,detail?:string}|null>}
 */
export async function detectSmartFallbackAction(page, config = null) {
  const cfg = config || globalAiConfig;
  try {
    if (!page || (typeof page.isClosed === 'function' && page.isClosed())) return null;
    return await page.evaluate((opts) => {
      const isVisible = (el) => {
        if (!el || el.disabled) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
        return Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      };

      // 1. Câu hỏi trắc nghiệm / bot verification (ví dụ "What sound does a dog make?")
      if (opts.solveBotQuiz !== false) {
        const botButtons = Array.from(document.querySelectorAll('.bot-detection-answer-list button, button[name="selected_answer"], [data-element-type="survey_answer"] button')).filter(isVisible);
        if (botButtons.length > 0) {
          const pageText = (document.body.innerText || '').toLowerCase();
          let targetBtn = null;
          if (/dog|puppy|chó/i.test(pageText)) {
            targetBtn = botButtons.find((b) => /woof|bark|gâu/i.test((b.value || b.innerText || '').toLowerCase()));
          } else if (/cat|kitten|mèo/i.test(pageText)) {
            targetBtn = botButtons.find((b) => /meow|purr|meo/i.test((b.value || b.innerText || '').toLowerCase()));
          } else if (/cow|cattle|bò/i.test(pageText)) {
            targetBtn = botButtons.find((b) => /moo/i.test((b.value || b.innerText || '').toLowerCase()));
          } else if (/duck|vịt/i.test(pageText)) {
            targetBtn = botButtons.find((b) => /quack/i.test((b.value || b.innerText || '').toLowerCase()));
          }
          if (!targetBtn) {
            targetBtn = botButtons[Math.floor(Math.random() * botButtons.length)];
          }
          if (targetBtn) {
            const val = targetBtn.value || (targetBtn.innerText || '').trim();
            const selector = targetBtn.name
              ? `button[name="${targetBtn.name}"][value="${val}"]`
              : (targetBtn.id ? `#${targetBtn.id}` : '.bot-detection-answer-list button');
            return { action: 'click', selector, detail: `Tự động trả lời câu hỏi trắc nghiệm: "${val}"` };
          }
        }
      }

      // 2. Câu hỏi khảo sát / quiz buttons / link thẻ a phương án trả lời (btn-option, choice-btn, option-btn, quiz-cards, pills)
      if (opts.solveSurveyCards !== false) {
        const surveyOptions = Array.from(document.querySelectorAll([
          '[id="btn-option"]:not(.active):not(.selected)',
          '[id^="btn-option"]:not(.active):not(.selected)',
          '[id*="btn-option"]:not(.active):not(.selected)',
          '.btn-option:not(.active):not(.selected)',
          'div.btn-option:not(.active):not(.selected)',
          'div.button:not(.active):not(.selected)',
          'div.btn:not(.active):not(.selected)',
          'a.btn-option:not(.active):not(.selected)',
          'a.choice:not(.active):not(.selected)',
          'a.choice-btn:not(.active):not(.selected)',
          'a.option-btn:not(.active):not(.selected)',
          'a.answer-btn:not(.active):not(.selected)',
          'a.quiz-btn:not(.active):not(.selected)',
          '.choices a:not(.active)',
          '.answers a:not(.active)',
          '.options a:not(.active)',
          '.options-container a:not(.active)',
          '.choice-container a:not(.active)',
          '[data-vector-answer="true"]:not(.active):not(.selected)',
          '.choice-btn:not(.active):not(.selected)',
          '.option-btn:not(.active):not(.selected)',
          '.quiz-btn:not(.active):not(.selected)',
          '.answer-btn:not(.active):not(.selected)',
          '.creative-survey-answer:not(.selected)',
          '.choice-card:not(.active):not(.selected)',
          '.option-card:not(.active):not(.selected)',
          '.quiz-card:not(.active):not(.selected)',
          '.survey-card:not(.active):not(.selected)',
          '.selection-card:not(.active):not(.selected)',
          '.pill-option:not(.active):not(.selected)',
          '.bubble-option:not(.active):not(.selected)',
          '[data-choice]:not(.active):not(.selected)',
          '[role="radio"]:not([aria-checked="true"])',
          'div[class*="button" i]:not(.active):not(.selected)',
          'div[class*="btn-option" i]:not(.active):not(.selected)',
        ].join(', '))).filter(isVisible);

        if (surveyOptions.length > 0) {
          const randomOpt = surveyOptions[Math.floor(Math.random() * surveyOptions.length)];
          const sel = randomOpt.id ? `[id="${randomOpt.id}"]` : (randomOpt.className ? `.${randomOpt.className.split(' ')[0]}` : '[id*="btn-option"]');
          return { action: 'click', selector: sel, detail: 'Tự động chọn ngẫu nhiên phương án khảo sát / choice card' };
        }
      }

      // 2.5. Các ô Checkbox chưa tích (Đặc biệt là checkbox điều khoản, consent, survey options, hoặc required)
      const uncheckedBoxes = Array.from(document.querySelectorAll([
        'input[type="checkbox"]:not(:checked)',
        '[role="checkbox"]:not([aria-checked="true"])',
        '.custom-checkbox:not(.checked):not(.active)',
        '.checkbox-card:not(.checked):not(.active)',
        'label.checkbox:not(.checked):not(.active)',
      ].join(', '))).filter((el) => {
        if (el.disabled) return false;
        const parent = el.closest('label, div, li, .form-check, .checkbox') || el;
        const style = window.getComputedStyle ? window.getComputedStyle(parent) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
        return Boolean(parent.offsetWidth || parent.offsetHeight || parent.getClientRects().length);
      });

      if (uncheckedBoxes.length > 0) {
        // Ưu tiên ô điều khoản/consent/required
        const consentBox = uncheckedBoxes.find((el) => {
          const parent = el.closest('label, div, li, .form-check, .checkbox') || el;
          const meta = `${el.id || ''} ${el.name || ''} ${el.className || ''} ${el.getAttribute('data-tf-element-role') || ''} ${parent ? parent.innerText || '' : ''}`.toLowerCase();
          return el.required || el.getAttribute('aria-required') === 'true' ||
            /consent|terms|agree|privacy|disclosure|tcpa|condition|policy|confirm|accept|must|required|mandatory|continue|certify|18\+|resident|marketing/i.test(meta);
        }) || uncheckedBoxes[0];

        const sel = consentBox.id
          ? `#${consentBox.id}`
          : (consentBox.name ? `input[name="${consentBox.name}"]` : (consentBox.className ? `.${consentBox.className.split(' ')[0]}` : 'input[type="checkbox"]'));
        return { action: 'check', selector: sel, detail: 'Tự động tích ô checkbox điều khoản / khảo sát' };
      }

      // 3. Nút Jump Page / Reward Screen
      if (opts.clickJumpPage !== false) {
        const jumpCta = Array.from(document.querySelectorAll(
          '.cta-button, .rjp-cta-button, .sjp-cta-button, a[href*="/next"], [aria-label*="Reward" i], [aria-label*="Get My" i]'
        )).find(isVisible);
        if (jumpCta) {
          const sel = jumpCta.className ? `.${jumpCta.className.split(' ')[0]}` : 'a[href*="/next"]';
          return { action: 'click', selector: sel, detail: 'Tự động click nút Jump Page / Reward (.cta-button)' };
        }
      }

      // 4. Nút Submit / Continue / Next (bao gồm cả button trong form và các thẻ div.button, div.btn-option ngoài form)
      if (opts.multiStepSubmit !== false) {
        const submitBtn = Array.from(document.querySelectorAll([
          'button[type="submit"]',
          'input[type="submit"]',
          '[data-vector-submit="true"]',
          'button.continue-btn',
          'button.submit-btn',
          'button.next-btn',
          '#btnSubmit',
          '#btnNext',
          '#btnContinue',
          'button[id*="submit" i]',
          'button[id*="continue" i]',
          'button[id*="next" i]',
          'button[class*="submit" i]',
          'button[class*="continue" i]',
          'button[class*="next" i]',
          'div.btn-option',
          'div.button',
          'div.btn',
          '[id="btn-option"]',
          '[id*="btn-option"]',
          '.btn-option',
          'div[class*="submit" i]',
          'div[class*="continue" i]',
          'div[class*="next" i]',
          'div[class*="button" i]',
          'div[class*="btn" i]',
          '[role="button"]',
        ].join(', '))).find(isVisible);
        if (submitBtn) {
          const sel = submitBtn.id ? `#${submitBtn.id}` : (submitBtn.className ? `.${submitBtn.className.split(' ')[0]}` : (submitBtn.tagName === 'BUTTON' ? 'button[type="submit"]' : '.btn-option'));
          return { action: 'click', selector: sel, detail: 'Tự động click nút Submit / Continue để chuyển màn' };
        }

        // 5. Fallback Form/Div Submit nếu không có nút riêng: tìm trong form hoặc div container chứa input
        const anyContainer = Array.from(document.querySelectorAll(
          'form, [role="form"], .form, .form-container, .survey-container, .quiz-container, div:has(input), div.input, div.button, .btn-option'
        )).find(isVisible);
        if (anyContainer) {
          const btn = anyContainer.querySelector('button, input[type="button"], input[type="submit"], div.button, div.btn-option, .btn-option, [role="button"], a.btn');
          if (btn) {
            const sel = btn.id ? `#${btn.id}` : (btn.className ? `.${btn.className.split(' ')[0]}` : 'button');
            return { action: 'click', selector: sel, detail: 'Tự động kích hoạt nút trong container form/div' };
          }
          const sel = anyContainer.id ? `#${anyContainer.id}` : (anyContainer.tagName === 'FORM' ? 'form' : 'div');
          return { action: 'click', selector: `${sel} button, ${sel} input[type="button"], ${sel} .btn-option, ${sel}`, detail: 'Tự động kích hoạt gửi form/div' };
        }
      }

      return null;
    }, {
      solveBotQuiz: cfg.solveBotQuiz !== false,
      solveSurveyCards: cfg.solveSurveyCards !== false,
      clickJumpPage: cfg.clickJumpPage !== false,
      multiStepSubmit: cfg.multiStepSubmit !== false,
    });
  } catch {
    return null;
  }
}

/**
 * Chạy vòng lặp AI assist: gọi agy/codex, thực thi actions, lặp đến khi hoàn tất hoặc không còn form.
 *
 * @param {object} page Playwright page đang kẹt.
 * @param {object} record Bản ghi autofill đang dùng cho phiên này.
 * @param {object} [session={}] Session object để log và cập nhật số trường.
 * @param {object} [options={}] Tùy chọn bổ sung (onLog callback, v.v.).
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
export async function runAiAssist(page, record, session = {}, options = {}) {
  const cfg = { ...globalAiConfig, ...(options.aiConfig || {}) };
  if (!cfg.enabled || cfg.mode === 'disabled') {
    const slotNum = (session.tileIndex ?? 0) + 1;
    console.log(`[AI-Assist] Slot ${slotNum}: AI Assist đang tắt theo cấu hình.`);
    return;
  }

  if (!session.aiRunningPages) session.aiRunningPages = new Set();
  if (session.aiRunningPages.has(page) || page._aiAssistRunning) return; // tab này đang chạy AI rồi
  session.aiRunningPages.add(page);
  page._aiAssistRunning = true;
  session.aiAssistRunning = session.aiRunningPages.size > 0;

  const slotNum = (session.tileIndex ?? 0) + 1;
  const tabNum = (page._tabIndex !== undefined) ? page._tabIndex + 1 : 1;
  const ip = session.exitIp ?? 'chưa rõ';

  const currentUrl = page.url?.() || '';
  if (!currentUrl || currentUrl.startsWith('about:') || currentUrl.startsWith('chrome:') || currentUrl.startsWith('chrome-error:') || currentUrl.includes('api.ipify.org') || currentUrl.includes('toffers.top/click')) {
    console.log(`[AI-Assist] Slot ${slotNum} Tab ${tabNum}: URL chưa phải trang form (${currentUrl}), bỏ qua AI.`);
    session.aiRunningPages.delete(page);
    page._aiAssistRunning = false;
    session.aiAssistRunning = session.aiRunningPages.size > 0;
    return;
  }

  console.log(`[AI-Assist] Slot ${slotNum} Tab ${tabNum} [IP: ${ip}]: bắt đầu hỗ trợ AI cho trang ${currentUrl} (Chế độ: ${cfg.mode})`);

  const updateBadge = (text) => {
    try {
      if (typeof session.updateBadge === 'function') {
        session.updateBadge(text);
      }
    } catch {}
  };

  const addLog = (entry) => {
    try {
      if (typeof options.onLog === 'function') {
        options.onLog(entry);
      } else if (typeof session.addLog === 'function') {
        session.addLog(entry);
      }
    } catch {}
  };

  let totalActionsExecuted = 0;
  const maxRounds = cfg.maxRounds || MAX_ROUNDS;

  try {
    for (let round = 1; round <= maxRounds; round++) {
      if (page.isClosed() || session.isClosed) break;

      // Vòng 1 luôn chạy AI vì onStuck đã xác nhận trang bị kẹt.
      // Từ vòng 2 trở đi, kiểm tra xem trang còn việc cần làm không.
      if (round > 1) {
        const stillHasWork = await pageHasWork(page);
        if (!stillHasWork) {
          console.log(`[AI-Assist] Slot ${slotNum}: trang không còn form/submit hoặc đã hoàn tất, kết thúc AI.`);
          break;
        }
      }

      // Tự động rà soát và tích toàn bộ checkbox điều khoản / consent / required còn sót trên trang
      try {
        const autoChecked = await page.evaluate(() => {
          let c = 0;
          const isVisible = (el) => {
            if (!el || el.disabled) return false;
            const parent = el.closest('label, div, li, .form-check, .checkbox') || el;
            const style = window.getComputedStyle ? window.getComputedStyle(parent) : null;
            if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
            return Boolean(parent.offsetWidth || parent.offsetHeight || parent.getClientRects().length);
          };

          const boxes = Array.from(document.querySelectorAll(
            'input[type="checkbox"]:not(:checked), [role="checkbox"]:not([aria-checked="true"])'
          )).filter(isVisible);

          for (const box of boxes) {
            const parent = box.closest('label, div, li, .form-check, .checkbox') || box;
            const meta = `${box.id || ''} ${box.name || ''} ${box.className || ''} ${box.getAttribute('data-tf-element-role') || ''} ${parent ? parent.innerText || '' : ''}`.toLowerCase();
            const shouldCheck = box.required || box.getAttribute('aria-required') === 'true' ||
              /consent|terms|agree|privacy|disclosure|tcpa|condition|policy|confirm|accept|must|required|mandatory|continue|certify|18\+|resident|marketing/i.test(meta) ||
              boxes.length <= 2;

            if (shouldCheck) {
              const label = box.closest('label') || (box.id ? document.querySelector(`label[for="${box.id}"]`) : null);
              if (label) {
                try { label.click(); } catch {}
              }
              box.checked = true;
              if (box.setAttribute) {
                box.setAttribute('aria-checked', 'true');
                box.setAttribute('data-ux-ai-done', '1');
              }
              try {
                box.dispatchEvent(new Event('input', { bubbles: true }));
                box.dispatchEvent(new Event('change', { bubbles: true }));
              } catch {}
              c++;
            }
          }
          return c;
        }).catch(() => 0);

        if (autoChecked > 0) {
          totalActionsExecuted += autoChecked;
          session.autofillFields = (session.autofillFields || 0) + autoChecked;
          addLog({
            time: new Date().toISOString(),
            type: 'ai_checkbox_checked',
            detail: `[AI Assist] 🛡️ Đã tự động tích ${autoChecked} ô checkbox điều khoản / consent trên trang.`,
          });
        }
      } catch {}

      updateBadge(`🌐 <strong>IP:</strong> ${ip} | <span style="color:#a78bfa;font-weight:600;">🤖 AI Assist đang phân tích (vòng ${round}/${maxRounds})...</span>`);
      addLog({
        time: new Date().toISOString(),
        type: 'ai_started',
        url: page.url(),
        detail: `[AI Assist] Đang phân tích trang ${page.url()} (vòng ${round}/${maxRounds})...`,
      });

      // Lấy toàn bộ HTML của top frame và tất cả các iframes trên trang
      let html = '';
      try {
        const frames = typeof page.frames === 'function' ? page.frames() : [page];
        const htmlParts = [];
        for (const frame of frames) {
          try {
            const frameHtml = await frame.content().catch(() => '');
            if (frameHtml && frameHtml.length > 50) {
              htmlParts.push(frameHtml);
            }
          } catch {}
        }
        html = htmlParts.join('\n<!-- IFRAME SEPARATOR -->\n');
      } catch {
        html = await page.content().catch(() => '');
      }

      if (!html) break;

      // Rút gọn và làm sạch HTML chỉ giữ lại cấu trúc tương tác
      const cleanedHtml = extractCleanPageStructure(html);
      const takeDealStage = await prepareTakeDealStage(page, session, addLog);

      const recordJson = JSON.stringify(record ?? {}, null, 2);
      let prompt = `Phân tích cấu trúc HTML giao diện người dùng bên dưới và chuyển đổi thành các thao tác Playwright UI tương ứng.
URL: ${page.url()}
Dữ liệu người dùng cung cấp:
${recordJson}

LƯU Ý ĐẶC BIỆT VỀ CẤU TRÚC OFFER / LANDING PAGE:
- Các trường nhập liệu thường KHÔNG ĐƯỢC BAO BỌC BỞI THẺ <form>, mà chỉ nằm trong các thẻ <div> độc lập mang class như "input", "inut", "form-group", "field", "step", hoặc các thẻ <input> đứng riêng lẻ.
- Nút bấm (Submit / Continue / Next / Lựa chọn) thường là các thẻ <div>, <a>, <button>, <input> mang class hoặc id như "button", "buttom", "btn", "btn-option", "continue-btn", "next-btn", "cta-button", hoặc role="button".
- TUYỆT ĐỐI KHÔNG chỉ tìm kiếm trong thẻ <form>. BẮT BUỘC kiểm tra toàn bộ cấu trúc các thẻ <div>, class "input", "button", "btn-option" để tìm ra các ô nhập liệu và nút bấm tương ứng.

YÊU CẦU ĐẦU RA BẮT BUỘC:
- Chỉ trả về duy nhất 1 JSON array các action hợp lệ. KHÔNG giải thích, KHÔNG viết markdown thừa, KHÔNG trả về object error hay thông báo từ chối.
- Nếu gặp câu hỏi logic / kiến thức thông thường (ví dụ: "What sound does a dog make?", "2 + 2 = ?"): BẮT BUỘC chọn đáp án chính xác tương ứng (ví dụ: "Woof", "4").
- Nếu gặp câu hỏi khảo sát hoặc ý kiến mà không có trong dữ liệu: BẮT BUỘC chọn 1 phương án hợp lý hoặc phổ biến nhất (ví dụ: Yes, Own, Good, hoặc button lựa chọn có sẵn) để tiếp tục quy trình.
- Nếu trên trang có trường thông tin (tên, họ, email, số điện thoại, ngày sinh, giới tính, địa chỉ, zip): ĐỐI CHIẾU VÀ ĐIỀN CHÍNH XÁC theo dữ liệu người dùng cung cấp ở trên.
- Nếu các trường đã điền đủ: BẮT BUỘC click vào nút "Next", "Continue", "Submit", "Get Quote", hoặc nút nhận thưởng / Jump Page ("Get My Reward", class ".cta-button", ".rjp-cta-button", link "/next").
- TUYỆT ĐỐI KHÔNG trả về mảng rỗng [] nếu trên trang vẫn còn câu hỏi, ô nhập, hoặc nút bấm chưa thao tác.

Format các action được hỗ trợ:
- Điền input/textarea: {"action":"fill","selector":"CSS_SELECTOR","value":"GIÁ_TRỊ"}
- Chọn dropdown: {"action":"select","selector":"CSS_SELECTOR","value":"GIÁ_TRỊ"}
- Tích checkbox: {"action":"check","selector":"CSS_SELECTOR"}
- Chọn radio hoặc bấm nút / thẻ lựa chọn / nút Tiếp tục: {"action":"click","selector":"CSS_SELECTOR"}`;

      if (takeDealStage) {
        prompt += `\n\nƯU TIÊN TAKE THE DEAL: Bật/chọn tất cả deal đang hiển thị trên trang (bao gồm checkbox, switch hoặc nút chọn trong từng deal), giữ nguyên lựa chọn đã bật, sau đó bấm nút "Take the Deal" để tiếp tục.`;
      }

      if (cfg.customInstructions && typeof cfg.customInstructions === 'string' && cfg.customInstructions.trim()) {
        prompt += `\n\nHƯỚNG DẪN BỔ SUNG CỦA NGƯỜI DÙNG:\n${cfg.customInstructions.trim()}`;
      }

      prompt += `\n\nHTML GIAO DIỆN:\n${cleanedHtml}`;

      let actions = [];
      const t0 = Date.now();

      if (cfg.mode === 'heuristic_only') {
        console.log(`[AI-Assist] Slot ${slotNum} round ${round}: Chế độ Heuristic Fallback Only, bỏ qua gọi CLI.`);
      } else if (session.isClosed) {
        break;
      } else {
        addLog({
          time: new Date().toISOString(),
          type: 'ai_waiting_codex',
          detail: `[AI Assist] ⏳ Đang chờ AI phản hồi (vòng ${round}/${maxRounds})… URL: ${page.url()}`,
        });
        await acquireAiConcurrencySlot();
        try {
          if (page.isClosed() || session.isClosed) break;
          const raw = await callAgt(prompt, { cliBinary: cfg.cliBinary, timeoutSeconds: cfg.timeoutSeconds });
          const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
          actions = parseActions(raw);
          console.log(`[AI-Assist] Slot ${slotNum} round ${round}: AI trả ${actions.length} action(s) (${elapsed}s)`);
          addLog({
            time: new Date().toISOString(),
            type: 'ai_codex_reply',
            detail: `[AI Assist] ✅ AI phản hồi sau ${elapsed}s — ${actions.length} action(s)`,
          });
        } catch (err) {
          const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
          console.warn(`[AI-Assist] Slot ${slotNum} round ${round}: cảnh báo AI sau ${elapsed}s — ${err.message}`);
          addLog({
            time: new Date().toISOString(),
            type: 'ai_error',
            detail: `[AI Assist] ❌ Lỗi gọi AI sau ${elapsed}s: ${err.message}`,
          });
        } finally {
          releaseAiConcurrencySlot();
        }
      }

      if (actions.length === 0) {
        // Fallback tự động thông minh: nếu AI trả về [] nhưng trang thực tế có câu hỏi trắc nghiệm, survey, nút Jump Page, hoặc Submit
        const smartFallback = await detectSmartFallbackAction(page, cfg);
        if (smartFallback) {
          actions = [{ action: smartFallback.action, selector: smartFallback.selector }];
          console.log(`[AI-Assist] Slot ${slotNum}: kích hoạt fallback: ${smartFallback.detail}`);
          addLog({
            time: new Date().toISOString(),
            type: 'ai_smart_fallback',
            detail: `[AI Assist] 🛡️ Fallback: ${smartFallback.detail}`,
          });
        } else {
          console.log(`[AI-Assist] Slot ${slotNum}: không còn việc cần làm ([] trả về).`);
          addLog({
            time: new Date().toISOString(),
            type: 'ai_no_actions',
            detail: `[AI Assist] Không còn form/câu hỏi cần xử lý.`,
          });
          break;
        }
      }

      for (const act of actions) {
        if (page.isClosed() || session.isClosed) break;
        try {
          updateBadge(`🌐 <strong>IP:</strong> ${ip} | <span style="color:#818cf8;font-weight:600;">🤖 AI: ${act.action} ${act.selector || ''}</span>`);
          await executeAction(page, act, session);
          totalActionsExecuted += 1;
          addLog({
            time: new Date().toISOString(),
            type: 'ai_action',
            detail: `[AI Assist] Thực thi ${act.action} trên selector: ${act.selector} ${act.value ? `("${act.value}")` : ''}`,
          });
          await new Promise((r) => setTimeout(r, 300));
        } catch (actErr) {
          console.warn(`[AI-Assist] Action lỗi: ${act.action} ${act.selector}: ${actErr.message}`);
        }
      }

      // Sync: kích autofill quét lại ngay sau khi AI thực thi xong actions
      if (cfg.syncAutofill !== false) {
        session.triggerAutofillScan?.();
        addLog({
          time: new Date().toISOString(),
          type: 'ai_sync_scan',
          detail: `[AI Assist] 🔄 Sync: kích autofill quét lại sau ${actions.length} action(s) của AI.`,
        });
      }

      // Chờ trang load ổn định hoặc chuyển màn (1.2s)
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 1200));
    }
  } finally {
    session.aiRunningPages?.delete(page);
    page._aiAssistRunning = false;
    session.aiAssistRunning = (session.aiRunningPages?.size ?? 0) > 0;
    session.aiCallCount = 0;
    updateBadge(`🌐 <strong>IP:</strong> ${ip} | <span style="color:#22c55e;font-weight:600;">🤖 AI xong</span>`);
    if (totalActionsExecuted > 0) {
      addLog({
        time: new Date().toISOString(),
        type: 'ai_completed',
        detail: `[AI Assist - Slot ${slotNum} Tab ${tabNum}] Đã hoàn tất các vòng hỗ trợ (${totalActionsExecuted} hành động đã thực hiện).`,
      });
    }
    console.log(`[AI-Assist] Slot ${slotNum} Tab ${tabNum}: kết thúc hỗ trợ AI (${totalActionsExecuted} actions).`);
  }
}

/**
 * Chẩn đoán lý do form chưa qua được (bị chặn, validation error, thiếu email)
 * bằng AI CLI (`agy`/`codex`) và tự động thực thi các hành động sửa lỗi trên form.
 *
 * @param {object} page Playwright page đang thao tác.
 * @param {object} record Bản ghi autofill của session.
 * @param {object} [session={}] Phiên session.
 * @param {object} [options={}] Tùy chọn mở rộng.
 * @return {Promise<{status: string, fixed: boolean, errors: string[], actionsCount: number}>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
export async function inspectAndFixFormWithAi(page, record, session = {}, options = {}) {
  if (!page || (typeof page.isClosed === 'function' && page.isClosed())) {
    return { status: 'closed', fixed: false, errors: [], actionsCount: 0 };
  }
  const cfg = { ...globalAiConfig, ...(options.aiConfig || {}) };
  if (!cfg.enabled || cfg.mode === 'disabled') {
    return { status: 'disabled', fixed: false, errors: [], actionsCount: 0 };
  }

  if (page._aiFormFixing) {
    return { status: 'in_progress', fixed: false, errors: [], actionsCount: 0 };
  }

  const currentUrl = typeof page.url === 'function' ? page.url() : (page.url || '');
  if (!currentUrl || currentUrl.startsWith('about:') || currentUrl.startsWith('chrome:') || currentUrl.startsWith('chrome-error:') || currentUrl.includes('api.ipify.org') || currentUrl.includes('toffers.top/click')) {
    return { status: 'invalid_url', fixed: false, errors: [], actionsCount: 0 };
  }

  page._aiFormFixing = true;
  if (!session.aiFixingPages) session.aiFixingPages = new Set();
  session.aiFixingPages.add(page);
  session.aiFormFixing = session.aiFixingPages.size > 0;

  const slotNum = (session.tileIndex ?? 0) + 1;
  const tabNum = (page._tabIndex !== undefined) ? page._tabIndex + 1 : 1;
  const ip = session.exitIp ?? 'chưa rõ';

  const updateBadge = (text) => {
    try {
      if (typeof session.updateBadge === 'function') {
        session.updateBadge(text);
      }
    } catch {}
  };

  const addLog = (entry) => {
    try {
      if (typeof options.onLog === 'function') {
        options.onLog(entry);
      } else if (typeof session.addLog === 'function') {
        session.addLog(entry);
      }
    } catch {}
  };

  const takeDealStage = await prepareTakeDealStage(page, session, addLog);

  try {
    // 1. Quét thu thập chi tiết các lỗi và input có vấn đề từ DOM
    const diag = await page.evaluate(() => {
      const isVisible = (el) => {
        if (!el) return false;
        if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
          const parent = el.closest('label, div, li, .form-check, .checkbox') || el;
          const s = window.getComputedStyle ? window.getComputedStyle(parent) : null;
          if (s && (s.display === 'none' || s.visibility === 'hidden')) return false;
          return Boolean(parent.offsetWidth || parent.offsetHeight || parent.getClientRects().length);
        }
        const s = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (s && (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0')) return false;
        return Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      };

      // 1. Quét các thẻ hiển thị thông báo lỗi
      const errEls = Array.from(document.querySelectorAll([
        '.error:not(input):not(select):not(form)',
        '.error-message',
        '.invalid-feedback',
        '.form-error',
        '.field-error',
        '[role="alert"]',
        '.alert-danger',
        '.alert-warning',
        '.validation-error',
        '.text-danger',
        '.help-block.error',
        '.has-error .help-block',
        '.msg-error',
        'label.error',
        '.parsley-errors-list.filled',
        '[data-error]'
      ].join(', '))).filter(isVisible);

      const errors = Array.from(new Set(
        errEls.map((e) => (e.innerText || e.textContent || '').trim())
          .filter((t) => t.length > 0 && !/^(ok|valid|success|chấp nhận)$/i.test(t))
      ));

      // 2. Quét các input, select, textarea và custom input trong div ngoài form
      const inputs = Array.from(document.querySelectorAll([
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"])',
        'select',
        'textarea',
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="combobox"]',
        '[contenteditable="true"]',
        'div.input input',
        'div.field input',
        '.btn-option',
        'div.btn-option',
      ].join(', '))).filter(isVisible);

      let emailInput = null;
      const problemInputs = [];

      for (const el of inputs) {
        const tag = el.tagName.toLowerCase();
        const type = (el.type || tag).toLowerCase();
        const id = el.id || '';
        const name = el.name || '';
        const placeholder = el.placeholder || '';
        const val = (el.value || el.innerText || '').trim();
        const isEmail = type === 'email' || /email|mail/i.test(name) || /email|mail/i.test(id) || /email|mail/i.test(placeholder);
        const isPlaceholderMask = /^(\+1|\+1\s*|\(___\)\s*___-____|___-__-____|[_\-\(\)\s\.\/]+|mm\/dd\/yyyy)$/i.test(val);
        const isEmpty = val === '' || isPlaceholderMask;
        const isInvalid = el.getAttribute('aria-invalid') === 'true' || el.classList.contains('error') || (el.validity && !el.validity.valid);
        const isCheckbox = type === 'checkbox' || el.getAttribute('role') === 'checkbox' || el.classList.contains('custom-checkbox');
        const isChecked = isCheckbox ? (el.checked || el.getAttribute('aria-checked') === 'true' || el.classList.contains('checked')) : true;
        const isReq = Boolean(el.required || el.getAttribute('aria-required') === 'true');

        if (isEmail && !emailInput) {
          emailInput = {
            id,
            name,
            type,
            val,
            isEmpty,
            isInvalid,
            required: isReq,
            selector: id ? `#${id}` : (name ? `input[name="${name}"]` : 'input[type="email"]'),
          };
        }

        if (isEmpty || isInvalid || (isCheckbox && !isChecked)) {
          problemInputs.push({
            tag,
            type,
            id,
            name,
            placeholder,
            currentValue: val,
            isEmpty,
            isInvalid,
            required: isReq,
            selector: id ? `#${id}` : (name ? `${tag}[name="${name}"]` : tag),
          });
        }
      }

      const emailMissing = emailInput ? (emailInput.isEmpty || !emailInput.val.includes('@') || emailInput.isInvalid) : false;

      return {
        errors,
        emailInput,
        emailMissing,
        problemInputs: problemInputs.slice(0, 15),
        hasBlocker: errors.length > 0 || emailMissing || problemInputs.some((p) => p.required || p.isInvalid),
      };
    }).catch(() => null);

    if (!diag || !diag.hasBlocker) {
      return { status: 'clean', fixed: false, errors: [], actionsCount: 0 };
    }

    const errorSummary = diag.errors.join('; ') || (diag.emailMissing ? 'Thiếu email / email không hợp lệ' : 'Trường bắt buộc chưa điền');
    console.log(`[AI-FormDiagnose] Slot ${slotNum} [IP: ${ip}]: Phát hiện form chưa qua được do lỗi: ${errorSummary}. Đang hỏi AI và tự sửa...`);
    updateBadge(`🌐 <strong>IP:</strong> ${ip} | <span style="color:#f43f5e;font-weight:600;">🤖 AI đang sửa lỗi: ${errorSummary.slice(0, 30)}...</span>`);
    addLog({
      time: new Date().toISOString(),
      type: 'ai_form_diagnosing',
      detail: `[AI Form Fix] Form chưa qua được (${errorSummary}). Đang gửi chẩn đoán cho AI...`,
    });

    let actions = [];

    // Lấy HTML sạch của trang
    let html = '';
    try {
      const frames = typeof page.frames === 'function' ? page.frames() : [page];
      const htmlParts = [];
      for (const frame of frames) {
        try {
          const frameHtml = await frame.content().catch(() => '');
          if (frameHtml && frameHtml.length > 50) htmlParts.push(frameHtml);
        } catch {}
      }
      html = htmlParts.join('\n<!-- IFRAME SEPARATOR -->\n');
    } catch {
      html = await page.content?.().catch(() => '') || '';
    }

    const cleanedHtml = extractCleanPageStructure(html);

    // Chuẩn bị email dự phòng tối ưu
    const candidateEmail = session.assignedEmail || record?.email || record?.assignedEmail ||
      (record?.firstname && record?.lastname
        ? `${String(record.firstname).toLowerCase()}.${String(record.lastname).toLowerCase()}${Math.floor(1000 + Math.random() * 9000)}@gmail.com`
        : `user${Math.floor(100000 + Math.random() * 900000)}@gmail.com`);

    // Ưu tiên sử dụng Codex SDK + Playwright MCP nếu phiên chạy qua AdsPower và có CDP endpoint
    const activeTargetUrl = (typeof page.url === 'function' ? page.url() : '') || session.targetUrl || session.offerUrl || '';
    if (session.isAdsPower && session.browserWebSocketUrl && cfg.useCodexMcp !== false && !page.isClosed() && activeTargetUrl.startsWith('http')) {
      console.log(`[AI-FormDiagnose] Slot ${slotNum}: Khởi động Codex + Playwright MCP Agent qua CDP endpoint...`);
      await acquireAiConcurrencySlot();
      try {
        if (!page.isClosed()) {
          const { runCodexFormAgent } = await import('./codex-form-agent.mjs');
          const agentResult = await runCodexFormAgent({
            endpoint: session.browserWebSocketUrl,
            targetUrl: activeTargetUrl,
            formData: { ...record, email: candidateEmail },
            allowSubmit: Boolean(options.autoSubmit !== false),
            takeDealStage,
            session,
            logger: (m) => console.log(`[Slot ${slotNum}] ${m}`),
          });
          if (agentResult && agentResult.success) {
            return {
              status: agentResult.status,
              fixed: true,
              errors: diag.errors,
              actionsCount: agentResult.toolCallsCount,
            };
          }
        }
      } catch (agentErr) {
        console.warn(`[AI-FormDiagnose] Slot ${slotNum}: Lỗi Codex Agent (${agentErr.message}), tiếp tục phương thức dự phòng.`);
      } finally {
        releaseAiConcurrencySlot();
      }
    }

    if (cfg.mode !== 'heuristic_only' && !page.isClosed()) {
      const prompt = `Phân tích tại sao form trên trang web này chưa submit qua được và sinh JSON actions để sửa triệt để mọi lỗi:
URL: ${page.url ? page.url() : ''}

LƯU Ý ĐẶC BIỆT VỀ CẤU TRÚC OFFER / LANDING PAGE:
- Các trường nhập liệu thường KHÔNG ĐƯỢC BAO BỌC BỞI THẺ <form>, mà chỉ nằm trong các thẻ <div> độc lập mang class như "input", "inut", "form-group", "field", "step", hoặc các thẻ <input> đứng riêng lẻ.
- Nút bấm (Submit / Continue / Next / Lựa chọn) thường là các thẻ <div>, <a>, <button>, <input> mang class hoặc id như "button", "buttom", "btn", "btn-option", "continue-btn", "next-btn", "cta-button", hoặc role="button".
- TUYỆT ĐỐI KHÔNG chỉ tìm kiếm trong thẻ <form>. BẮT BUỘC kiểm tra toàn bộ cấu trúc các thẻ <div>, class "input", "button", "btn-option" để tìm ra các ô nhập liệu và nút bấm tương ứng.

LỖI HIỂN THỊ TRÊN FORM TỪ DOM:
${diag.errors.length > 0 ? diag.errors.map((e) => `- ${e}`).join('\n') : '(Chưa submit thành công, các trường dưới đây có vấn đề)'}

CÁC TRƯỜNG CÓ VẤN ĐỀ HOẶC CHƯA ĐIỀN:
${JSON.stringify(diag.problemInputs, null, 2)}

DỮ LIỆU NGƯỜI DÙNG CUNG CẤP:
${JSON.stringify({ ...record, email: candidateEmail }, null, 2)}

YÊU CẦU ĐẦU RA BẮT BUỘC:
1. Phân tích nguyên nhân tại sao chưa qua được form (ví dụ: thiếu email, email không hợp lệ, sai zip code, chưa tích checkbox điều khoản, số điện thoại không đúng định dạng, v.v.).
2. Trả về DUY NHẤT một mảng JSON các action để sửa trực tiếp các lỗi đó trên form và bấm nút tiếp tục:
   - Điền input/textarea: {"action":"fill","selector":"CSS_SELECTOR","value":"GIÁ_TRỊ"}
   - Chọn dropdown: {"action":"select","selector":"CSS_SELECTOR","value":"GIÁ_TRỊ"}
   - Tích checkbox: {"action":"check","selector":"CSS_SELECTOR"}
   - Nút tiếp tục / submit: {"action":"click","selector":"CSS_SELECTOR"}
KHÔNG giải thích thêm, KHÔNG markdown thừa.

HTML GIAO DIỆN FORM:
${cleanedHtml}`;

      if (takeDealStage) {
        prompt += `\n\nƯU TIÊN TAKE THE DEAL: Bật/chọn tất cả deal đang hiển thị trên trang (checkbox, switch hoặc nút chọn trong từng deal), giữ nguyên lựa chọn đã bật, rồi bấm "Take the Deal".`;
      }

      try {
        await acquireAiConcurrencySlot();
        if (!page.isClosed()) {
          const raw = await callAgt(prompt, { cliBinary: cfg.cliBinary, timeoutSeconds: 30 });
          actions = parseActions(raw);
          console.log(`[AI-FormDiagnose] Slot ${slotNum}: AI trả về ${actions.length} action(s) sửa lỗi form.`);
        }
      } catch (err) {
        console.warn(`[AI-FormDiagnose] Slot ${slotNum}: AI CLI không phản hồi (${err.message}). Chuyển sang Heuristic Auto-Healer.`);
      } finally {
        releaseAiConcurrencySlot();
      }
    }

    // Heuristic Fallback Repair: Tự động sửa trực tiếp nếu AI không trả về actions hoặc mode là heuristic_only
    if (actions.length === 0) {
      console.log(`[AI-FormDiagnose] Slot ${slotNum}: Thực thi Heuristic Auto-Healer sửa các trường lỗi...`);
      // 1. Sửa ô Email nếu thiếu hoặc sai
      if (diag.emailMissing && diag.emailInput) {
        actions.push({
          action: 'fill',
          selector: diag.emailInput.selector,
          value: candidateEmail,
        });
      }

      // 2. Sửa các input có vấn đề khác
      for (const prob of diag.problemInputs) {
        if (prob.type === 'checkbox') {
          actions.push({ action: 'check', selector: prob.selector });
        } else if (prob.tag === 'select') {
          actions.push({ action: 'select', selector: prob.selector, value: '1' });
        } else if (prob.type === 'tel' || /phone|mobile/i.test(prob.name + prob.id)) {
          const rawPhone = String(record?.phone || '8149143396').replace(/\D/g, '').slice(-10);
          actions.push({ action: 'fill', selector: prob.selector, value: rawPhone });
        } else if (/zip|postal/i.test(prob.name + prob.id)) {
          actions.push({ action: 'fill', selector: prob.selector, value: record?.zipcode || '99654' });
        } else if (/first/i.test(prob.name + prob.id)) {
          actions.push({ action: 'fill', selector: prob.selector, value: record?.firstname || 'James' });
        } else if (/last/i.test(prob.name + prob.id)) {
          actions.push({ action: 'fill', selector: prob.selector, value: record?.lastname || 'Smith' });
        } else if (/address|street/i.test(prob.name + prob.id)) {
          actions.push({ action: 'fill', selector: prob.selector, value: record?.address || '4125 N Inspiration Loop' });
        } else if (/birth|dob/i.test(prob.name + prob.id)) {
          actions.push({ action: 'fill', selector: prob.selector, value: record?.dob || '04/15/1992' });
        }
      }

      // 3. Tự động click nút Submit / Continue / Next / btn-option để chuyển màn
      if (options.autoSubmit !== false) {
        actions.push({
          action: 'click',
          selector: 'button[type="submit"], input[type="submit"], button.continue-btn, button.submit-btn, #btnSubmit, #btnNext, .btn-option, div.btn-option, div.button, .cta-button',
        });
      }
    }

    let actionsCount = 0;
    for (const act of actions) {
      if (page.isClosed() || session.isClosed) break;
      try {
        await executeAction(page, act, session);
        actionsCount++;
        addLog({
          time: new Date().toISOString(),
          type: 'ai_form_healed_action',
          detail: `[AI Form Fix] Thực thi sửa lỗi ${act.action} trên ${act.selector} ${act.value ? `("${act.value}")` : ''}`,
        });
        await new Promise((r) => setTimeout(r, 200));
      } catch (e) {
        console.warn(`[AI-FormDiagnose] Action lỗi: ${act.action} ${act.selector}: ${e.message}`);
      }
    }

    // Sau khi sửa xong: nếu đã điền email, cập nhật cờ session.emailFilled = true
    if (candidateEmail && (diag.emailMissing || actions.some((a) => /email/i.test(a.selector || '')))) {
      session.emailFilled = true;
      session.screenHasEmail = true;
      if (!session.assignedEmail) session.assignedEmail = candidateEmail;
    }

    if (actionsCount > 0) {
      console.log(`[AI-FormDiagnose] Slot ${slotNum}: Đã thực hiện ${actionsCount} hành động sửa lỗi form.`);
      updateBadge(`🌐 <strong>IP:</strong> ${ip} | <span style="color:#10b981;font-weight:600;">🤖 Đã sửa lỗi form (${actionsCount} action)</span>`);
      // Trigger autofill quét lại để thẩm định
      session.triggerAutofillScan?.();
      return { status: 'healed', fixed: true, errors: diag.errors, actionsCount };
    }

    return { status: 'no_actions', fixed: false, errors: diag.errors, actionsCount: 0 };
  } catch (err) {
    console.warn(`[AI-FormDiagnose] Slot ${slotNum} Tab ${tabNum}: Lỗi quy trình chẩn đoán form: ${err.message}`);
    return { status: 'error', fixed: false, errors: [], actionsCount: 0 };
  } finally {
    page._aiFormFixing = false;
    session.aiFixingPages?.delete(page);
    session.aiFormFixing = (session.aiFixingPages?.size ?? 0) > 0;
  }
}
