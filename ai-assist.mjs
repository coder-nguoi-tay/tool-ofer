/**
 * AI fallback khi autofill bị kẹt: gọi `agy` CLI, đọc HTML trang, thực thi actions cho đến khi không còn form.
 *
 * @module ai-assist
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { humanType, getFallbackCity } from './autofill.mjs';

const MAX_ROUNDS = 20;
const AI_PROGRESS_CHECK_INTERVAL_MS = 5_000;
const AI_STALLED_ROUND_LIMIT = 3;
const AI_REQUEST_TIMEOUT_SECONDS = 90;
const AI_FORM_REPAIR_TIMEOUT_MS = 20_000;
const MAX_CONCURRENT_AGT = 4;
const MAX_FORM_REPAIR_ATTEMPTS = 3;
const CODEX_MODEL = 'gpt-5.6-luna';
const CODEX_REASONING_EFFORT = 'low';
let agtRunningCount = 0;

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
 * Tôn trọng thời gian chờ AI đã cấu hình, giới hạn để tránh tiến trình treo vô hạn.
 *
 * @param {number|string} configuredSeconds Số giây người dùng cấu hình.
 * @return {number} Thời gian chờ từ 1 đến 180 giây.
 * @throws {never} Giá trị không hợp lệ được thay bằng mặc định.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-23
 */
export function resolveAiTimeoutSeconds(configuredSeconds) {
  const seconds = Number(configuredSeconds);
  return Math.max(1, Math.min(seconds > 0 ? seconds : AI_REQUEST_TIMEOUT_SECONDS, 180));
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
    // 4. Tinh gọn theo hướng FORM-FIRST: loại head và các vùng không chứa form/câu hỏi
    //    để AI chỉ nhìn thấy form, nút và câu hỏi — không bị văn bản pháp lý/menu loạn.
    .replace(/<head\b[\s\S]*?<\/head>/gi, '')
    .replace(/<(header|footer|nav|aside)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<(div|section|ul|p)\b[^>]*\s(?:id|class)="[^"]*(?:\blegal\b|legal-|disclaimer|copyright|breadcrumb|cookie|sidebar|social-|related-|blog-|article-|post-|upsell|promo)[^"]*"[^>]*>[\s\S]*?<\/\1>/gi, '<!-- [REGION_DROPPED] -->')
    // 5. Thu gọn attribute ồn ào (style, on*, gtm, aria không cần thiết)
    .replace(/\sstyle="[^"]*"/gi, '')
    .replace(/\son[a-z]+="[^"]*"/gi, '')
    .replace(/\sdata-gtm[a-z-]*="[^"]*"/gi, '')
    .replace(/\saria-expanded="[^"]*"/gi, '')
    .replace(/\saria-selected="[^"]*"/gi, '')
    // 6. Cắt text node quá dài (legal text, mô tả) giữ 120 ký tự đầu + dấu grompt
    .replace(/>([^<>{}\n]{200,})</g, (_m, txt) => `>${txt.slice(0, 120)}…<`)
    // 7. Thu gọn whitespace thừa
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n');

  // Giới hạn tối đa 40KB cho AI prompt: đủ cho mọi form phức tạp, prompt gọn hơn
  // giúp AI phản hồi nhanh và bám sát form thay vì dao động quanh nội dung rác.
  if (cleaned.length > 40_000) {
    cleaned = cleaned.slice(0, 40_000) + '\n<!-- [TRUNCATED] -->';
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
    const timeoutMs = resolveAiTimeoutSeconds(options.timeoutSeconds || globalAiConfig.timeoutSeconds) * 1000;
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
 * Chụp trạng thái tương tác của các frame để phát hiện form có tiến triển hay chưa.
 *
 * @param {object} page Trang Playwright cần theo dõi.
 * @return {Promise<string>} Chuỗi trạng thái form dùng để so sánh giữa hai lần kiểm tra.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
async function getFormProgressSignature(page) {
  try {
    const frames = typeof page.frames === 'function' ? page.frames() : [page];
    const frameSignatures = await Promise.all(frames.map(async (frame) => {
      try {
        const evaluation = frame.evaluate(() => {
          const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
          const controlState = Array.from(document.querySelectorAll(
            'input, textarea, select, [role="checkbox"], [role="radio"]'
          )).slice(0, 100).map((element) => ({
            id: element.id || '',
            name: element.name || '',
            type: element.type || element.getAttribute('role') || element.tagName,
            value: element.value || '',
            checked: Boolean(element.checked) || element.getAttribute('aria-checked') === 'true',
            invalid: element.getAttribute('aria-invalid') === 'true',
            disabled: Boolean(element.disabled),
          }));
          const messages = Array.from(document.querySelectorAll(
            '[role="alert"], [aria-invalid="true"], .error, .error-message, .validation-error'
          )).slice(0, 30).map((element) => normalize(element.innerText || element.textContent).slice(0, 500)).filter(Boolean);
          const controls = Array.from(document.querySelectorAll(
            'button, [role="button"], .btn-option, .choice-btn, .answer-btn'
          )).slice(0, 100).map((element) => ({
            text: normalize(element.innerText || element.textContent || element.getAttribute('aria-label')).slice(0, 300),
            selected: Boolean(element.checked) || element.getAttribute('aria-checked') === 'true' ||
              /active|selected|checked/i.test(String(element.className || '')),
            disabled: Boolean(element.disabled),
          }));
          const regions = Array.from(document.querySelectorAll(
            'form, [role="form"], .form-container, .survey-container, .quiz-container, .question, .survey-question, .step'
          )).slice(0, 30).map((element) => normalize(element.innerText).slice(0, 500)).filter(Boolean);

          return JSON.stringify({
            url: window.location.href,
            title: document.title,
            regions,
            controlState,
            messages,
            controls,
          });
        }).catch(() => '');
        let timer;
        const timeout = new Promise((resolve) => {
          timer = setTimeout(() => resolve(''), 2000);
          timer.unref?.();
        });
        return await Promise.race([evaluation, timeout]).finally(() => clearTimeout(timer));
      } catch {
        return '';
      }
    }));
    return frameSignatures.filter(Boolean).join('\n');
  } catch {
    return '';
  }
}

/**
 * Chờ tối đa một khoảng ngắn để xác định trạng thái form có thay đổi sau thao tác hay không.
 *
 * @param {object} page Trang Playwright cần chờ.
 * @param {string} previousSignature Trạng thái form trước thao tác.
 * @param {number} [timeoutMs=AI_PROGRESS_CHECK_INTERVAL_MS] Thời gian tối đa chờ thay đổi.
 * @return {Promise<boolean>} True nếu form thay đổi trong thời gian chờ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
async function waitForFormProgress(page, previousSignature, timeoutMs = AI_PROGRESS_CHECK_INTERVAL_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !(typeof page.isClosed === 'function' && page.isClosed())) {
    const currentSignature = await getFormProgressSignature(page);
    if (currentSignature && currentSignature !== previousSignature) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
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
 * Thực thi action AI và xác minh trạng thái DOM trước khi báo thành công.
 *
 * @param {object} page Playwright page.
 * @param {{action:string,selector?:string,value?:string}} act Action cần thực thi.
 * @param {object} [session=null] Phiên session để cập nhật số trường đã xác minh.
 * @return {Promise<{ok:boolean,verified:boolean,reason:string}>} Kết quả thao tác và xác minh.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
export async function executeAction(page, act, session = null) {
  const { action, selector, value } = act ?? {};
  if (!selector) return { ok: false, verified: false, reason: 'missing_selector' };
  if (action === 'click' && selector.trim() === '[id="question-answers"]') {
    return { ok: false, verified: false, reason: 'answer_container_not_button' };
  }
  if (!page || (typeof page.isClosed === 'function' && page.isClosed())) {
    return { ok: false, verified: false, reason: 'page_closed' };
  }

  let locatorGroup;
  try {
    locatorGroup = page.locator(selector);
  } catch {
    return { ok: false, verified: false, reason: 'invalid_selector' };
  }
  const count = typeof locatorGroup.count === 'function' ? await locatorGroup.count().catch(() => 0) : 1;
  if (count === 0) return { ok: false, verified: false, reason: 'selector_not_found' };

  let locator = null;
  for (let index = 0; index < count; index += 1) {
    const candidate = typeof locatorGroup.nth === 'function' ? locatorGroup.nth(index) : locatorGroup.first();
    let visible = await candidate.isVisible({ timeout: 1000 }).catch(() => false);
    if (!visible) {
      visible = await candidate.evaluate((el) => {
      const isInput = el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio');
      if (!isInput) return false;
      const parent = el.closest('label, div, li');
      if (!parent) return false;
      const style = window.getComputedStyle ? window.getComputedStyle(parent) : null;
      if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
      return Boolean(parent.offsetWidth || parent.offsetHeight || parent.getClientRects().length);
      }).catch(() => false);
    }
    if (visible) {
      locator = candidate;
      break;
    }
  }
  if (!locator) return { ok: false, verified: false, reason: 'element_not_visible' };

  try {
    if (action === 'fill' || action === 'type') {
      let fillValue = String(value ?? '');
      if (session?.assignedEmail && (/email|mail/i.test(selector) || /@/.test(fillValue))) {
        fillValue = session.assignedEmail;
      }
      await humanType(locator, fillValue, page);
      await locator.evaluate((el) => {
        const field = el.matches?.('input, textarea') ? el : el.querySelector?.('input, textarea');
        if (!field) return;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        field.dispatchEvent(new Event('blur', { bubbles: true }));
      });
      const actualValue = typeof locator.inputValue === 'function'
        ? await locator.inputValue({ timeout: 2000 }).catch(() => locator.evaluate((el) => {
          const field = el.matches?.('input, textarea') ? el : el.querySelector?.('input, textarea');
          return field?.value ?? (el.isContentEditable ? el.innerText : '');
        }))
        : await locator.evaluate((el) => {
          const field = el.matches?.('input, textarea') ? el : el.querySelector?.('input, textarea');
          return field?.value ?? (el.isContentEditable ? el.innerText : '');
        });
      const normalizedExpected = String(fillValue).trim().normalize('NFKC');
      const normalizedActual = String(actualValue ?? '').trim().normalize('NFKC');
      const isEmail = /email|mail/i.test(selector) || /@/.test(fillValue);
      const matchesValue = isEmail
        ? normalizedActual.toLowerCase() === normalizedExpected.toLowerCase()
        : normalizedActual === normalizedExpected;
      if (!matchesValue) return { ok: false, verified: false, reason: 'value_not_present' };

      await locator.evaluate((el) => {
        const field = el.matches?.('input, textarea') ? el : el.querySelector?.('input, textarea');
        field?.setAttribute('data-ux-ai-done', '1');
        field?.setAttribute('data-ux-filled', '1');
      }).catch(() => {});
      if (session) {
        session.autofillFields = (session.autofillFields || 0) + 1;
        session.lastActionTime = Date.now();
      }
      return { ok: true, verified: true, reason: 'value_verified' };
    }

    if (action === 'select') {
      let selected = false;
      try {
        await locator.selectOption(String(value ?? ''), { force: true, timeout: 2000 });
        selected = true;
      } catch {
        try {
          await locator.selectOption({ label: String(value ?? '') }, { force: true, timeout: 1000 });
          selected = true;
        } catch {}
      }
      if (!selected) return { ok: false, verified: false, reason: 'select_failed' };
      const selectedOption = await locator.evaluate((el) => {
        const option = el.selectedOptions?.[0];
        return option ? { value: option.value, label: (option.textContent || '').trim() } : null;
      }).catch(() => null);
      const expectedOption = String(value ?? '').trim();
      if (!selectedOption || (selectedOption.value !== expectedOption && selectedOption.label !== expectedOption)) {
        return { ok: false, verified: false, reason: 'selection_not_verified' };
      }
      await locator.evaluate((el) => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.setAttribute('data-ux-ai-done', '1');
        el.setAttribute('data-ux-filled', '1');
      });
      if (session) {
        session.autofillFields = (session.autofillFields || 0) + 1;
        session.lastActionTime = Date.now();
      }
      return { ok: true, verified: true, reason: 'selection_verified' };
    }

    if (action === 'check') {
      const alreadyChecked = await locator.evaluate((el) => {
        const field = el.matches?.('input[type="checkbox"], input[type="radio"]')
          ? el
          : el.querySelector?.('input[type="checkbox"], input[type="radio"]');
        return Boolean(
          field?.checked ||
          el.getAttribute('aria-checked') === 'true' ||
          el.getAttribute('aria-pressed') === 'true' ||
          el.classList?.contains('checked') ||
          el.classList?.contains('selected') ||
          el.classList?.contains('active')
        );
      }).catch(() => false);
      if (alreadyChecked) return { ok: true, verified: true, reason: 'already_checked' };

      let checked = false;
      if (typeof locator.check === 'function') {
        try {
          await locator.check({ force: true, timeout: 2000 });
          checked = true;
        } catch {}
      }
      if (!checked && typeof locator.click === 'function') {
        try {
          await locator.click({ force: true, timeout: 1000 });
          checked = true;
        } catch {}
      }
      const checkedState = checked ? await locator.evaluate((el) => {
        const field = el.matches?.('input[type="checkbox"], input[type="radio"]')
          ? el
          : el.querySelector?.('input[type="checkbox"], input[type="radio"]');
        return Boolean(
          field?.checked ||
          el.getAttribute('aria-checked') === 'true' ||
          el.getAttribute('aria-pressed') === 'true' ||
          el.classList?.contains('checked') ||
          el.classList?.contains('selected') ||
          el.classList?.contains('active')
        );
      }).catch(() => false) : false;
      if (!checkedState) return { ok: false, verified: false, reason: 'checked_state_not_verified' };
      await locator.evaluate((el) => {
        el.setAttribute('data-ux-ai-done', '1');
        el.setAttribute('data-ux-filled', '1');
      }).catch(() => {});
      if (session) {
        session.autofillFields = (session.autofillFields || 0) + 1;
        session.lastActionTime = Date.now();
      }
      return { ok: true, verified: true, reason: 'checked_state_verified' };
    }

    if (action === 'click') {
      let clicked = false;
      if (typeof locator.click === 'function') {
        try {
          await locator.click({ force: true, timeout: 2500 });
          clicked = true;
        } catch {}
      }
      if (!clicked && typeof locator.evaluate === 'function') {
        try {
          await locator.evaluate((el) => el.click());
          clicked = true;
        } catch {}
      }
      if (!clicked) return { ok: false, verified: false, reason: 'click_failed' };
      await locator.evaluate((el) => el.setAttribute('data-ux-clicked', '1')).catch(() => {});
      if (session) session.lastActionTime = Date.now();
      return { ok: true, verified: false, reason: 'click_dispatched' };
    }

    return { ok: false, verified: false, reason: 'unsupported_action' };
  } catch {
    return { ok: false, verified: false, reason: 'action_execution_error' };
  }
}

/**
 * Đọc trạng thái validation thực của form, bỏ qua nội dung cảnh báo và hướng dẫn chung.
 *
 * @param {object} page Trang Playwright cần kiểm tra.
 * @return {Promise<{errors:string[],emailInput:object|null,emailMissing:boolean,problemInputs:object[],hasBlocker:boolean}|null>} Trạng thái lỗi form đang hiển thị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
async function inspectFormRepairState(page) {
  const evaluation = page.evaluate(() => {
    const isVisible = (element) => {
      if (!element) return false;
      if (element.tagName === 'INPUT' && (element.type === 'checkbox' || element.type === 'radio')) {
        const parent = element.closest('label, div, li, .form-check, .checkbox') || element;
        const style = window.getComputedStyle ? window.getComputedStyle(parent) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
        return Boolean(parent.offsetWidth || parent.offsetHeight || parent.getClientRects().length);
      }
      const style = window.getComputedStyle ? window.getComputedStyle(element) : null;
      if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
      return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
    };
    const looksLikeValidationMessage = (text) => /required|invalid|incorrect|error|failed|not valid|please (?:enter|provide|select|accept|check)|must be|is missing|cannot be blank|can't be blank|does not match|doesn't match/i.test(text);
    const explicitErrorSelector = [
      '.error-message', '.invalid-feedback', '.form-error', '.field-error', '.validation-error',
      '.help-block.error', '.has-error .help-block', '.msg-error', 'label.error',
      '.parsley-errors-list.filled', '[data-error]:not([data-error="false"])',
    ].join(', ');
    const explicitErrors = Array.from(document.querySelectorAll(explicitErrorSelector))
      .filter(isVisible)
      .map((element) => (element.innerText || element.textContent || '').trim())
      .filter((text) => text.length > 0 && !/^(ok|valid|success|accepted)$/i.test(text));
    const alertErrors = Array.from(document.querySelectorAll('[role="alert"], [aria-live="assertive"], .alert-danger'))
      .filter(isVisible)
      .map((element) => (element.innerText || element.textContent || '').trim())
      .filter((text) => looksLikeValidationMessage(text));
    const errors = Array.from(new Set([...explicitErrors, ...alertErrors]));
    const inputs = Array.from(document.querySelectorAll([
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"])',
      'select', 'textarea', '[role="checkbox"]', '[role="radio"]', '[role="combobox"]',
      '[contenteditable="true"]', '.btn-option', 'div.btn-option',
    ].join(', '))).filter(isVisible);

    let emailInput = null;
    const problemInputs = [];
    for (const element of inputs) {
      if (element.type === 'search' || element.closest?.('form[role="search"], form:has(input[type="search"][name="q"])')) continue;
      const tag = element.tagName.toLowerCase();
      const type = (element.type || element.getAttribute('role') || tag).toLowerCase();
      const id = element.id || '';
      const name = element.name || '';
      const placeholder = element.placeholder || '';
      const value = (element.value || element.innerText || '').trim();
      const isEmail = type === 'email' || /email|mail/i.test(`${name} ${id} ${placeholder}`);
      const isPlaceholderMask = /^(\+1|\+1\s*|\(___\)\s*___-____|___-__-____|[_\-()\s.\/]+|mm\/dd\/yyyy)$/i.test(value);
      const isEmpty = value === '' || isPlaceholderMask;
      const isInvalid = element.getAttribute('aria-invalid') === 'true' || element.classList.contains('error') || Boolean(element.validity && !element.validity.valid);
      const isCheckbox = type === 'checkbox' || type === 'radio' || element.getAttribute('role') === 'checkbox';
      const isChecked = isCheckbox
        ? Boolean(element.checked || element.getAttribute('aria-checked') === 'true' || element.classList.contains('checked'))
        : true;
      const isRequired = Boolean(element.required || element.getAttribute('aria-required') === 'true');
      const selector = id ? `#${id}` : (name ? `${tag}[name="${name}"]` : tag);

      if (isEmail && !emailInput) {
        emailInput = { id, name, type, val: value, isEmpty, isInvalid, required: isRequired, selector };
      }
      if (isEmpty || isInvalid || (isCheckbox && !isChecked)) {
        problemInputs.push({
          tag, type, id, name, placeholder, currentValue: value, isEmpty, isInvalid,
          required: isRequired, selector,
        });
      }
    }

    const emailMissing = Boolean(emailInput && (emailInput.isEmpty || !emailInput.val.includes('@') || emailInput.isInvalid));
    const hasRequiredProblem = problemInputs.some((input) => input.required || input.isInvalid);
    return {
      errors,
      emailInput,
      emailMissing,
      problemInputs: problemInputs.slice(0, 15),
      hasBlocker: errors.length > 0 || emailMissing || hasRequiredProblem,
    };
  }).catch(() => null);
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), 4000);
    timer.unref?.();
  });
  return Promise.race([evaluation, timeout]).finally(() => clearTimeout(timer));
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
      if (opts.solveSurveyCards !== false && opts.pickRandom === true) {
        const surveyOptions = Array.from(document.querySelectorAll([
          'button[id^="answer-"]',
          'button.question-answer-button',
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
        ].join(', '))).filter((el) => isVisible(el) && !el.closest('form[role="search"], form:has(input[type="search"][name="q"])') &&
          (el.matches('button, a, [role="button"], [role="radio"]')));

        if (surveyOptions.length > 0) {
          const randomOpt = surveyOptions[Math.floor(Math.random() * surveyOptions.length)];
          document.querySelectorAll('[data-ux-ai-fallback-choice="1"]').forEach((el) => el.removeAttribute('data-ux-ai-fallback-choice'));
          randomOpt.setAttribute('data-ux-ai-fallback-choice', '1');
          const sel = '[data-ux-ai-fallback-choice="1"]';
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
 * @throws {Error} Nếu thao tác Playwright ngoài các nhánh fallback phát sinh lỗi.
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
  let stagnantRounds = 0;
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
      const formStateBeforeAi = await getFormProgressSignature(page);

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

      if (cfg.customInstructions && typeof cfg.customInstructions === 'string' && cfg.customInstructions.trim()) {
        prompt += `\n\nHƯỚNG DẪN BỔ SUNG CỦA NGƯỜI DÙNG:\n${cfg.customInstructions.trim()}`;
      }

      prompt += `\n\nHTML GIAO DIỆN:\n${cleanedHtml}`;

      let actions = [];
      let t0 = Date.now();

      if (cfg.mode === 'heuristic_only') {
        console.log(`[AI-Assist] Slot ${slotNum} round ${round}: Chế độ Heuristic Fallback Only, bỏ qua gọi CLI.`);
      } else if (session.isClosed) {
        break;
      } else {
        // Tối đa MAX_CONCURRENT_AGT tiến trình AI chạy cùng lúc; slot khác xếp hàng. Ghi log khi phải chờ
        // để giao diện không trông như AI bị treo, và chỉ tính thời gian phản hồi từ lúc thật sự gọi AI.
        if (agtRunningCount >= MAX_CONCURRENT_AGT) {
          addLog({
            time: new Date().toISOString(),
            type: 'ai_queued',
            detail: `[AI Assist] ⏸ Đang xếp hàng chờ lượt AI (${agtRunningCount}/${MAX_CONCURRENT_AGT} slot đang dùng AI).`,
          });
        }
        const queuedAt = Date.now();
        while (agtRunningCount >= MAX_CONCURRENT_AGT && !page.isClosed() && !session.isClosed) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (page.isClosed() || session.isClosed) break;
        const queuedSeconds = ((Date.now() - queuedAt) / 1000).toFixed(1);
        if (Number(queuedSeconds) >= 1) console.log(`[AI-Assist] Slot ${slotNum} round ${round}: chờ lượt AI ${queuedSeconds}s.`);
        t0 = Date.now();
        addLog({
          time: new Date().toISOString(),
          type: 'ai_waiting_codex',
          detail: `[AI Assist] ⏳ Đang chờ AI phản hồi (vòng ${round}/${maxRounds})… URL: ${page.url()}`,
        });
        agtRunningCount++;
        try {
           const raw = await callAgt(prompt, {
             cliBinary: cfg.cliBinary,
             timeoutSeconds: resolveAiTimeoutSeconds(cfg.timeoutSeconds),
           });
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
          agtRunningCount = Math.max(0, agtRunningCount - 1);
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
          const stillHasWork = await pageHasWork(page);
          if (stillHasWork) {
            console.log(`[AI-Assist] Slot ${slotNum}: AI chưa đề xuất action; sẽ kiểm tra lại sau ${AI_PROGRESS_CHECK_INTERVAL_MS / 1000}s.`);
            addLog({
              time: new Date().toISOString(),
              type: 'ai_no_actions',
              detail: `[AI Assist] AI chưa đề xuất action nhưng form còn việc; watchdog sẽ kiểm tra lại sau ${AI_PROGRESS_CHECK_INTERVAL_MS / 1000}s.`,
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
      }

      for (const act of actions) {
        if (page.isClosed() || session.isClosed) break;
        try {
          updateBadge(`🌐 <strong>IP:</strong> ${ip} | <span style="color:#818cf8;font-weight:600;">🤖 AI: ${act.action} ${act.selector || ''}</span>`);
          const actionResult = await executeAction(page, act, session);
          if (!actionResult.ok) {
            addLog({
              time: new Date().toISOString(),
              type: 'ai_action_failed',
              detail: `[AI Assist] Không thực hiện được ${act.action} trên ${act.selector || '(thiếu selector)'}: ${actionResult.reason}.`,
            });
            continue;
          }
          totalActionsExecuted += 1;
          addLog({
            time: new Date().toISOString(),
            type: actionResult.verified ? 'ai_action' : 'ai_action_dispatched',
            detail: actionResult.verified
              ? `[AI Assist] Đã xác minh ${act.action} trên selector: ${act.selector} ${act.value ? `("${act.value}")` : ''}`
              : `[AI Assist] Đã gửi thao tác ${act.action} tới selector: ${act.selector}; đang chờ giao diện xác nhận chuyển bước.`,
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

      // Nếu form vẫn đứng yên sau 5 giây, vòng kế tiếp sẽ gửi lại trạng thái mới cho AI.
      const formChanged = await waitForFormProgress(page, formStateBeforeAi);
      if (formChanged) {
        stagnantRounds = 0;
        addLog({
          time: new Date().toISOString(),
          type: 'ai_form_progress',
          detail: `[AI Assist] Form đã thay đổi sau vòng ${round}; tiếp tục kiểm tra trạng thái mới.`,
        });
      } else {
        stagnantRounds++;
        addLog({
          time: new Date().toISOString(),
          type: 'ai_watchdog_retry',
          detail: `[AI Assist] Form không đổi sau ${AI_PROGRESS_CHECK_INTERVAL_MS / 1000}s; sẽ gọi lại AI (${stagnantRounds}/${AI_STALLED_ROUND_LIMIT}).`,
        });
        if (stagnantRounds >= AI_STALLED_ROUND_LIMIT) {
          try { session.triggerAutofillScan?.(); } catch {}
          addLog({
            time: new Date().toISOString(),
            type: 'ai_watchdog_fallback',
            detail: `[AI Assist] Form vẫn không đổi sau ${stagnantRounds} lần; đã kích hoạt Autofill fallback và dừng vòng lặp để tránh treo.`,
          });
          break;
        }
      }
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
 * @return {Promise<{status: string, fixed: boolean, errors: string[], actionsCount: number}>} Trạng thái sửa form đã được xác minh hoặc lý do chưa sửa được.
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

  try {
    // AutoFill đã chạy trước khi tới đây; chỉ kiểm tra lại trạng thái sau lượt điền thư viện.
    const diag = await inspectFormRepairState(page);

    if (!diag) {
      updateBadge(`🌐 <strong>IP:</strong> ${ip} | <span style="color:#f59e0b;font-weight:600;">🤖 Không đọc được form</span>`);
      addLog({
        time: new Date().toISOString(),
        type: 'ai_form_inspection_failed',
        detail: '[AI Form Fix] Không đọc được trạng thái form trong 4 giây; dừng lượt này để tránh chờ vô hạn.',
      });
      return { status: 'inspection_failed', fixed: false, errors: [], actionsCount: 0 };
    }
    if (!diag.hasBlocker) {
      page._aiFormRepairRetry = null;
      return { status: 'clean', fixed: false, errors: [], actionsCount: 0 };
    }

    const retrySignature = createHash('sha256').update(JSON.stringify({
      url: currentUrl,
      errors: diag.errors,
      blockers: diag.problemInputs
        .filter((input) => input.required || input.isInvalid)
        .map(({ selector, type, required, isInvalid }) => ({ selector, type, required, isInvalid })),
      emailMissing: diag.emailMissing,
    })).digest('hex');
    const previousRetry = page._aiFormRepairRetry;
    if (previousRetry?.signature === retrySignature && previousRetry.attempts >= MAX_FORM_REPAIR_ATTEMPTS) {
      if (!previousRetry.limitLogged) {
        addLog({
          time: new Date().toISOString(),
          type: 'ai_form_retry_limit',
          detail: `[AI Form Fix] Dừng sau ${MAX_FORM_REPAIR_ATTEMPTS} lần vì cùng lỗi vẫn còn trên form.`,
        });
        previousRetry.limitLogged = true;
      }
      updateBadge(`🌐 <strong>IP:</strong> ${ip} | <span style="color:#f59e0b;font-weight:600;">🤖 Dừng sửa form sau ${MAX_FORM_REPAIR_ATTEMPTS} lần</span>`);
      return { status: 'retry_limit', fixed: false, errors: diag.errors, actionsCount: 0 };
    }
    const retryAttempts = previousRetry?.signature === retrySignature ? previousRetry.attempts + 1 : 1;
    page._aiFormRepairRetry = { signature: retrySignature, attempts: retryAttempts };

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
      const htmlParts = await Promise.all(frames.slice(0, 8).map(async (frame) => {
        let timer;
        try {
          const contentPromise = frame.content().catch(() => '');
          const timeoutPromise = new Promise((resolve) => {
            timer = setTimeout(() => resolve(''), 2000);
            timer.unref?.();
          });
          return await Promise.race([contentPromise, timeoutPromise]);
        } catch {
          return '';
        } finally {
          clearTimeout(timer);
        }
      }));
      html = htmlParts.filter((frameHtml) => frameHtml && frameHtml.length > 50).join('\n<!-- IFRAME SEPARATOR -->\n');
    } catch {
      let timer;
      try {
        const contentPromise = page.content?.().catch(() => '') || Promise.resolve('');
        const timeoutPromise = new Promise((resolve) => {
          timer = setTimeout(() => resolve(''), 2000);
          timer.unref?.();
        });
        html = await Promise.race([contentPromise, timeoutPromise]);
      } finally {
        clearTimeout(timer);
      }
    }

    const cleanedHtml = extractCleanPageStructure(html);

    // Chuẩn bị email dự phòng tối ưu
    const candidateEmail = session.assignedEmail || record?.email || record?.assignedEmail ||
      (record?.firstname && record?.lastname
        ? `${String(record.firstname).toLowerCase()}.${String(record.lastname).toLowerCase()}${Math.floor(1000 + Math.random() * 9000)}@gmail.com`
        : `user${Math.floor(100000 + Math.random() * 900000)}@gmail.com`);

    const effectiveCity = record?.city || record?.town || getFallbackCity(record?.state, record?.zipcode) || 'Wasilla';
    const enrichedRecord = { ...record, email: candidateEmail, city: effectiveCity, town: effectiveCity };

    // Ưu tiên sử dụng Codex SDK + Playwright MCP nếu phiên chạy qua AdsPower và có CDP endpoint
    const activeTargetUrl = (typeof page.url === 'function' ? page.url() : '') || session.targetUrl || session.offerUrl || '';
    if (session.isAdsPower && session.browserWebSocketUrl && cfg.useCodexMcp !== false && !page.isClosed() && activeTargetUrl.startsWith('http')) {
      console.log(`[AI-FormDiagnose] Slot ${slotNum}: Khởi động Codex + Playwright MCP Agent qua CDP endpoint...`);
      try {
        const { runCodexFormAgent } = await import('./codex-form-agent.mjs');
        const agentResult = await runCodexFormAgent({
          endpoint: session.browserWebSocketUrl,
          targetUrl: activeTargetUrl,
          formData: enrichedRecord,
          allowSubmit: Boolean(options.autoSubmit !== false),
          timeoutMs: AI_FORM_REPAIR_TIMEOUT_MS,
          session,
          logger: (m) => console.log(`[Slot ${slotNum}] ${m}`),
        });
        if (agentResult?.status === 'timeout') {
          updateBadge(`🌐 <strong>IP:</strong> ${ip} | <span style="color:#f59e0b;font-weight:600;">🤖 AI hết giờ; autofill tiếp tục</span>`);
          addLog({
            time: new Date().toISOString(),
            type: 'ai_form_timeout',
            detail: `[AI Form Fix] Dừng lượt AI sau ${AI_FORM_REPAIR_TIMEOUT_MS / 1000}s để form không chờ vô hạn.`,
          });
          return { status: 'timeout', fixed: false, errors: diag.errors, actionsCount: agentResult.toolCallsCount || 0 };
        }
        if (agentResult?.success) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const afterAgentDiag = await inspectFormRepairState(page);
          const pageAdvanced = (typeof page.url === 'function' ? page.url() : page.url) !== currentUrl;
          if (afterAgentDiag && !afterAgentDiag.hasBlocker) {
            page._aiFormRepairRetry = null;
            return { status: agentResult.status, fixed: true, errors: diag.errors, actionsCount: agentResult.toolCallsCount };
          }
          if (pageAdvanced) {
            page._aiFormRepairRetry = null;
            return { status: 'progressed', fixed: true, errors: diag.errors, actionsCount: agentResult.toolCallsCount };
          }
          addLog({
            time: new Date().toISOString(),
            type: 'ai_form_repair_unverified',
            detail: '[AI Form Fix] AI đã thao tác nhưng kiểm tra lại vẫn thấy lỗi; chưa ghi nhận form đã sửa.',
          });
        }
      } catch (agentErr) {
        console.warn(`[AI-FormDiagnose] Slot ${slotNum}: Lỗi Codex Agent (${agentErr.message}), tiếp tục phương thức dự phòng.`);
      }
    }

    if (cfg.mode !== 'heuristic_only' && agtRunningCount < MAX_CONCURRENT_AGT && !page.isClosed()) {
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
${JSON.stringify(enrichedRecord, null, 2)}

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

      try {
        agtRunningCount++;
        const raw = await callAgt(prompt, { cliBinary: cfg.cliBinary, timeoutSeconds: AI_REQUEST_TIMEOUT_SECONDS });
        actions = parseActions(raw);
        console.log(`[AI-FormDiagnose] Slot ${slotNum}: AI trả về ${actions.length} action(s) sửa lỗi form.`);
      } catch (err) {
        console.warn(`[AI-FormDiagnose] Slot ${slotNum}: AI CLI không phản hồi (${err.message}). Chuyển sang Heuristic Auto-Healer.`);
      } finally {
        agtRunningCount = Math.max(0, agtRunningCount - 1);
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
        const probIdentity = `${prob.name || ''} ${prob.id || ''} ${prob.placeholder || ''} ${prob.selector || ''}`.toLowerCase();
        if (prob.type === 'checkbox') {
          actions.push({ action: 'check', selector: prob.selector });
        } else if (prob.tag === 'select') {
          actions.push({ action: 'select', selector: prob.selector, value: '1' });
        } else if (/city|town|^ct$/i.test(probIdentity) || prob.id === 'ct' || prob.name === 'city') {
          const fallbackCity = getFallbackCity(record?.state, record?.zipcode) || 'Wasilla';
          actions.push({ action: 'fill', selector: prob.selector, value: record?.city || record?.town || fallbackCity });
        } else if (/zip|postal|^zp$/i.test(probIdentity) || prob.id === 'zp' || prob.name === 'zippost') {
          actions.push({ action: 'fill', selector: prob.selector, value: record?.zipcode || '99654' });
        } else if (/first|^fn$/i.test(probIdentity) || prob.id === 'fn' || prob.name === 'firstname') {
          actions.push({ action: 'fill', selector: prob.selector, value: record?.firstname || 'James' });
        } else if (/last|^ln$/i.test(probIdentity) || prob.id === 'ln' || prob.name === 'lastname') {
          actions.push({ action: 'fill', selector: prob.selector, value: record?.lastname || 'Smith' });
        } else if (/address|street|^ad$/i.test(probIdentity) || prob.id === 'ad' || prob.name === 'address1') {
          actions.push({ action: 'fill', selector: prob.selector, value: record?.address || '4125 N Inspiration Loop' });
        } else if (/birth|dob/i.test(probIdentity)) {
          actions.push({ action: 'fill', selector: prob.selector, value: record?.dob || '04/15/1992' });
        } else if ((prob.type === 'tel' || /phone|mobile|^tl$/i.test(probIdentity) || prob.id === 'tl') && !/city|town|^ct$|zip|address|street/i.test(probIdentity)) {
          const rawPhone = String(record?.phone || '8149143396').replace(/\D/g, '').slice(-10);
          actions.push({ action: 'fill', selector: prob.selector, value: rawPhone });
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

    const beforeRepairState = await getFormProgressSignature(page);
    let actionsCount = 0;
    let actionsDispatchedCount = 0;
    for (const act of actions) {
      if (page.isClosed() || session.isClosed) break;
      try {
        const actionResult = await executeAction(page, act, session);
        if (!actionResult.ok) {
          addLog({
            time: new Date().toISOString(),
            type: 'ai_form_action_failed',
            detail: `[AI Form Fix] Không thực hiện được ${act.action} trên ${act.selector || '(thiếu selector)'}: ${actionResult.reason}.`,
          });
          continue;
        }
        if (actionResult.verified) {
          actionsCount += 1;
        } else {
          actionsDispatchedCount += 1;
        }
        addLog({
          time: new Date().toISOString(),
          type: actionResult.verified ? 'ai_form_action_verified' : 'ai_form_action_dispatched',
          detail: actionResult.verified
            ? `[AI Form Fix] Đã xác minh ${act.action} trên ${act.selector}.`
            : `[AI Form Fix] Đã gửi thao tác ${act.action} tới ${act.selector}; chưa xác nhận form chuyển bước.`,
        });
        await new Promise((resolve) => setTimeout(resolve, 250));
      } catch (e) {
        console.warn(`[AI-FormDiagnose] Action lỗi: ${act.action} ${act.selector}: ${e.message}`);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    const afterRepairDiag = await inspectFormRepairState(page);
    const afterRepairState = await getFormProgressSignature(page);
    const pageAdvanced = (typeof page.url === 'function' ? page.url() : page.url) !== currentUrl;
    const formProgressed = Boolean(afterRepairState && afterRepairState !== beforeRepairState);
    const blockersCleared = Boolean(afterRepairDiag && !afterRepairDiag.hasBlocker);

    // Cập nhật email chỉ khi DOM xác nhận giá trị hợp lệ sau lượt sửa.
    if (candidateEmail && afterRepairDiag?.emailInput && !afterRepairDiag.emailMissing) {
      session.emailFilled = true;
      session.screenHasEmail = true;
      if (!session.assignedEmail) session.assignedEmail = candidateEmail;
    }

    if (blockersCleared || pageAdvanced) {
      page._aiFormRepairRetry = null;
      console.log(`[AI-FormDiagnose] Slot ${slotNum}: Xác minh form đã hết lỗi hoặc đã chuyển sang màn tiếp theo.`);
      updateBadge(`🌐 <strong>IP:</strong> ${ip} | <span style="color:#10b981;font-weight:600;">🤖 Đã xác minh form tiếp tục</span>`);
      session.triggerAutofillScan?.();
      return { status: pageAdvanced ? 'progressed' : 'healed', fixed: true, errors: diag.errors, actionsCount };
    }

    if (actionsCount > 0 || actionsDispatchedCount > 0 || formProgressed) {
      addLog({
        time: new Date().toISOString(),
        type: 'ai_form_repair_unverified',
        detail: `[AI Form Fix] Có ${actionsCount} thao tác đã xác minh và ${actionsDispatchedCount} thao tác đã gửi, nhưng form vẫn còn lỗi; chưa ghi nhận đã sửa.`,
      });
      updateBadge(`🌐 <strong>IP:</strong> ${ip} | <span style="color:#f59e0b;font-weight:600;">🤖 Form còn lỗi sau khi sửa</span>`);
      session.triggerAutofillScan?.();
      return { status: 'unverified', fixed: false, errors: afterRepairDiag?.errors || diag.errors, actionsCount };
    }

    return { status: 'no_actions', fixed: false, errors: afterRepairDiag?.errors || diag.errors, actionsCount: 0 };
  } catch (err) {
    console.warn(`[AI-FormDiagnose] Slot ${slotNum} Tab ${tabNum}: Lỗi quy trình chẩn đoán form: ${err.message}`);
    return { status: 'error', fixed: false, errors: [], actionsCount: 0 };
  } finally {
    page._aiFormFixing = false;
    session.aiFixingPages?.delete(page);
    session.aiFormFixing = (session.aiFixingPages?.size ?? 0) > 0;
  }
}
