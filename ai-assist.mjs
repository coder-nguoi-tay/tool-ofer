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
function getAgtSpawnConfig() {
  const codexBin = process.env.CODEX_BIN || 'codex';
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
 * @return {Promise<string>} Output từ AI CLI.
 */
export function callAgt(prompt) {
  return new Promise((resolve, reject) => {
    const { bin, env } = getAgtSpawnConfig();
    const isCodex = bin.includes('codex');
    const args = isCodex
      ? ['exec', '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '--ephemeral', '--json', '-']
      : [];

    const child = spawn(bin, args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${bin} timeout (quá ${AGT_TIMEOUT_MS / 1000}s)`));
    }, AGT_TIMEOUT_MS);

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
      const anyForm = document.querySelector('form');
      const anySubmitBtn = document.querySelector('button[type="submit"], input[type="submit"], [data-vector-submit="true"], button.continue-btn, button.submit-btn');
      if (isThankYou && !anyForm && !anySubmitBtn) {
        return false;
      }

      // 1. Ô nhập liệu (input, textarea, select) chưa có dữ liệu hợp lệ
      const hasUnfilledInput = Array.from(document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]), textarea, select'
      )).some((el) => {
        if (el.disabled || el.readOnly) return false;
        if (!isVisible(el)) return false;
        if (el.getAttribute('data-autolead-ai-done') === '1') return false;

        const val = (el.value || '').trim();
        const isPlaceholderMask = /^(\+1|\+1\s*|\(___\)\s*___-____|___-__-____|[_\-\(\)\s\.\/]+|mm\/dd\/yyyy)$/i.test(val);
        return val === '' || isPlaceholderMask;
      });

      if (hasUnfilledInput) return true;

      // 2. Ô checkbox điều khoản bắt buộc chưa được tích
      const hasUncheckedConsent = Array.from(document.querySelectorAll('input[type="checkbox"]')).some((el) => {
        if (el.disabled || el.checked) return false;
        const meta = `${el.id} ${el.name} ${el.className} ${el.getAttribute('data-tf-element-role') || ''}`;
        return /consent|terms|agree|privacy|disclosure|tcpa|condition/i.test(meta) || el.required;
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

      // 4. Câu hỏi khảo sát / quiz cards / lựa chọn chưa click hoặc chưa hoàn thành
      const surveyCandidates = Array.from(document.querySelectorAll([
        '[id="btn-option"]:not(.active):not(.selected)',
        '[id^="btn-option"]:not(.active):not(.selected)',
        '[id*="btn-option"]:not(.active):not(.selected)',
        '.btn-option:not(.active):not(.selected)',
        'button.btn-option:not(.active):not(.selected)',
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
      ].join(', '))).some((el) => {
        if (el.disabled) return false;
        if (!isVisible(el)) return false;
        if (el.getAttribute('data-autolead-clicked') === '1') return false;

        if (el.type === 'submit' || el.getAttribute('data-vector-submit') === 'true' || /submit|continue|next|cta-button|rjp-cta/i.test(el.className) || (el.tagName === 'A' && el.href && el.href.includes('/next'))) {
          return true;
        }

        const text = (el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || '').trim().toLowerCase();
        return /^(continue|next|submit|proceed|start|get\s*quote|see\s*my\s*options|view\s*results|get\s*my\s*reward|claim\s*reward|claim\s*my\s*reward|get\s*reward|view\s*deals|unlock|tiếp\s*tục|xem\s*kết\s*quả|bước\s*tiếp|gửi)/i.test(text);
      });

      if (submitCandidates) return true;

      // 6. Có form đang hiển thị
      const hasActiveForm = Array.from(document.querySelectorAll('form')).some((f) => isVisible(f));
      return hasActiveForm;
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
      el.setAttribute('data-autolead-ai-done', '1');
      el.setAttribute('data-autolead-filled', '1');
    }).catch(() => {});
    if (session) {
      session.autofillFields = (session.autofillFields || 0) + 1;
      session.lastActionTime = Date.now();
    }
  } else if (action === 'click') {
    await locator.click({ force: true, timeout: 2500 }).catch(async () => {
      await locator.evaluate((el) => el.click()).catch(() => {});
    });
    await locator.evaluate((el) => {
      el.setAttribute('data-autolead-clicked', '1');
      el.setAttribute('data-autolead-ai-done', '1');
      el.classList.add('active', 'selected');
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
      el.setAttribute('data-autolead-ai-done', '1');
      el.setAttribute('data-autolead-filled', '1');
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
      el.setAttribute('data-autolead-ai-done', '1');
      el.setAttribute('data-autolead-filled', '1');
      el.checked = true;
    }).catch(() => {});
    if (session) {
      session.autofillFields = (session.autofillFields || 0) + 1;
      session.lastActionTime = Date.now();
    }
  }
}

/**
 * Chạy vòng lặp AI assist: gọi agy, thực thi actions, lặp đến khi hoàn tất hoặc không còn form.
 *
 * @param {object} page Playwright page đang kẹt.
 * @param {object} record Bản ghi autofill đang dùng cho phiên này.
 * @param {object} [session={}] Session object để log và cập nhật số trường.
 * @param {object} [options={}] Tùy chọn bổ sung (onLog callback, v.v.).
 * @return {Promise<void>}
 */
export async function runAiAssist(page, record, session = {}, options = {}) {
  if (!session.aiRunningPages) session.aiRunningPages = new Set();
  if (session.aiRunningPages.has(page)) return; // tab này đang chạy AI rồi
  session.aiRunningPages.add(page);
  session.aiAssistRunning = session.aiRunningPages.size > 0;

  const slotNum = (session.tileIndex ?? 0) + 1;
  const ip = session.exitIp ?? 'chưa rõ';
  console.log(`[AI-Assist] Slot ${slotNum} [IP: ${ip}]: bắt đầu hỗ trợ AI cho trang ${page.url()}`);

  const updateBadge = (text) => {
    try {
      if (typeof session.updateBadge === 'function') {
        session.updateBadge(text);
      } else if (page && !page.isClosed()) {
        page.evaluate((t) => {
          const b = document.getElementById('__autolead_ip_badge');
          if (b) b.innerHTML = t;
        }, text).catch(() => {});
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

  try {
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      if (page.isClosed()) break;

      // Vòng 1 luôn chạy AI vì onStuck đã xác nhận trang bị kẹt.
      // Từ vòng 2 trở đi, kiểm tra xem trang còn việc cần làm không.
      if (round > 1) {
        const stillHasWork = await pageHasWork(page);
        if (!stillHasWork) {
          console.log(`[AI-Assist] Slot ${slotNum}: trang không còn form/submit hoặc đã hoàn tất, kết thúc AI.`);
          break;
        }
      }

      updateBadge(`🌐 <strong>IP:</strong> ${ip} | <span style="color:#a78bfa;font-weight:600;">🤖 AI Assist đang phân tích (vòng ${round}/${MAX_ROUNDS})...</span>`);
      addLog({
        time: new Date().toISOString(),
        type: 'ai_started',
        url: page.url(),
        detail: `[AI Assist] Đang phân tích trang ${page.url()} (vòng ${round}/${MAX_ROUNDS})...`,
      });

      const html = await page.content().catch(() => '');
      if (!html) break;

      // Rút gọn và làm sạch HTML chỉ giữ lại cấu trúc tương tác (loại bỏ script, style, svg, comments)
      // giúp AI phân tích cực nhanh và chính xác, tránh timeout và tràn context
      const cleanedHtml = extractCleanPageStructure(html);

      const recordJson = JSON.stringify(record ?? {});
      const prompt = `Bạn là agent tự động điền form, trả lời khảo sát và bấm chuyển bước trên web.
URL: ${page.url()}
Thông tin người dùng: ${recordJson}
Vòng thực thi: ${round}/${MAX_ROUNDS}

Nhiệm vụ: Phân tích HTML bên dưới và trả về JSON array các action cần thực hiện để hoàn thành bước hiện tại (điền ô nhập, chọn dropdown, trả lời câu hỏi khảo sát/quiz/radio, tích checkbox điều khoản, và ĐẶC BIỆT là click nút Tiếp tục / Next / Continue / Submit để chuyển màn).
Chỉ trả về JSON array, không giải thích gì thêm.

Format các action được hỗ trợ:
- Điền input/textarea: {"action":"fill","selector":"CSS_SELECTOR","value":"GIÁ_TRỊ"}
- Chọn dropdown: {"action":"select","selector":"CSS_SELECTOR","value":"GIÁ_TRỊ"}
- Tích checkbox: {"action":"check","selector":"CSS_SELECTOR"}
- Chọn radio hoặc bấm nút / thẻ lựa chọn / nút Tiếp tục: {"action":"click","selector":"CSS_SELECTOR"}

Quy tắc xử lý QUAN TRỌNG:
1. Nếu trên form các trường đã có dữ liệu hoặc đã được điền đủ: BẮT BUỘC tìm và trả về action "click" vào nút "Continue", "Next", "Submit", "Get Quote", "Tiếp tục", "Xem kết quả" để chuyển sang bước tiếp theo!
2. Nếu có ô text/number/email/tel chưa điền: điền bằng thông tin phù hợp từ người dùng.
3. Nếu có câu hỏi khảo sát / câu hỏi quiz (radio, card lựa chọn, danh sách nút Yes/No, btn-option): click chọn một phương án phù hợp hoặc ngẫu nhiên (ví dụ: Yes, Own home, Good, v.v.).
4. Nếu có checkbox điều khoản (consent, terms, TCPA, agree): tích checkbox đó bằng action "check" hoặc "click".
5. Sau khi điền/chọn xong các trường trên màn hình hiện tại: luôn thêm action "click" vào nút "Continue", "Next", "Submit" để chuyển màn!
6. ĐẶC BIỆT CHÚ Ý TRANG CHUYỂN TIẾP / JUMP PAGE / REWARD SCREEN (ví dụ: màn hình thứ 5 sau khi nhập ngày sinh/giới tính): Nếu trang hiển thị nút nhận thưởng hoặc chuyển tiếp như "Get My Reward", "Claim Reward", "View Deals", "Continue", thẻ <a class="cta-button" href="/next..."> hoặc <a class="rjp-cta-button">, BẮT BUỘC trả về action click nút/link đó: {"action":"click","selector":".cta-button"} hoặc selector tương ứng!
7. Tuyệt đối KHÔNG trả về mảng rỗng [] nếu trên trang vẫn còn form, câu hỏi, hoặc nút Tiếp tục/Next/Submit chưa bấm!
8. Chỉ trả về [] khi trang ĐÃ LÀ TRANG CẢM ƠN (Thank You / Congratulations / Success / Application Received) hoặc HOÀN TOÀN KHÔNG CÒN BẤT KỲ NÚT TIẾP TỤC / FORM NÀO!

HTML:
${cleanedHtml}`;

      let actions = [];
      const t0 = Date.now();
      addLog({
        time: new Date().toISOString(),
        type: 'ai_waiting_codex',
        detail: `[AI Assist] ⏳ Đang chờ AI phản hồi (vòng ${round}/${MAX_ROUNDS})… URL: ${page.url()}`,
      });
      try {
        const raw = await callAgt(prompt);
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
        break;
      }

      if (actions.length === 0) {
        // Fallback tự động: nếu AI trả về [] nhưng trang thực tế có nút Jump Page CTA hoặc btn-option chưa chọn
        let fallbackHandled = false;
        try {
          const ctaLoc = page.locator('.cta-button, .rjp-cta-button, .sjp-cta-button, a[href*="/next"], [aria-label*="Reward" i]').first();
          if ((await ctaLoc.count().catch(() => 0)) > 0 && (await ctaLoc.isVisible().catch(() => false))) {
            fallbackHandled = true;
            actions = [{ action: 'click', selector: '.cta-button, .rjp-cta-button, .sjp-cta-button, a[href*="/next"], [aria-label*="Reward" i]' }];
            console.log(`[AI-Assist] Slot ${slotNum}: AI trả [], tự động kích hoạt fallback click nút Jump Page CTA.`);
            addLog({
              time: new Date().toISOString(),
              type: 'ai_fallback_cta',
              detail: `[AI Assist] Tự động phát hiện và bấm nút Jump Page / Reward (.cta-button).`,
            });
          }
        } catch {}

        if (!fallbackHandled) {
          console.log(`[AI-Assist] Slot ${slotNum}: AI báo không còn việc cần làm ([] trả về).`);
          addLog({
            time: new Date().toISOString(),
            type: 'ai_no_actions',
            detail: `[AI Assist] AI trả [] — không còn form/câu hỏi cần xử lý.`,
          });
          break;
        }
      }

      for (const act of actions) {
        if (page.isClosed()) break;
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
      session.triggerAutofillScan?.();
      addLog({
        time: new Date().toISOString(),
        type: 'ai_sync_scan',
        detail: `[AI Assist] 🔄 Sync: kích autofill quét lại sau ${actions.length} action(s) của AI.`,
      });

      // Chờ trang load ổn định hoặc chuyển màn (1.2s)
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 1200));
    }
  } finally {
    session.aiRunningPages?.delete(page);
    session.aiAssistRunning = (session.aiRunningPages?.size ?? 0) > 0;
    session.aiCallCount = 0;
    updateBadge(`🌐 <strong>IP:</strong> ${ip} | <span style="color:#22c55e;font-weight:600;">🤖 AI xong</span>`);
    if (totalActionsExecuted > 0) {
      addLog({
        time: new Date().toISOString(),
        type: 'ai_completed',
        detail: `[AI Assist] Đã hoàn tất các vòng hỗ trợ (${totalActionsExecuted} hành động đã thực hiện).`,
      });
    }
    console.log(`[AI-Assist] Slot ${slotNum}: kết thúc hỗ trợ AI (${totalActionsExecuted} actions).`);
  }
}
