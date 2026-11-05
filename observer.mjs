/**
 * Manual Ops Observer — ghi nhận thao tác tay/click của người dùng trên trình duyệt
 * (kể cả iframe cross-origin) ra file JSONL để nghiên cứu hành vi link offer.
 * File: logs/manual-ops-<timestamp>.jsonl (mỗi dòng 1 event JSON).
 *
 * @author coder-nguoi-tay
 * @since 2026-10-25
 */
import { join } from 'node:path';
import { mkdirSync, appendFileSync, statSync, renameSync } from 'node:fs';

/**
 * Script inject vào mọi frame: bắt click/submit/navigation thật (isTrusted),
 * forward về top window qua postMessage, top window gom vào __manualOpsQueue.
 */
const OBSERVER_INIT_SCRIPT = `
(() => {
  if (window.__uxObsInit) return;
  window.__uxObsInit = true;
  window.__manualOpsQueue = window.__manualOpsQueue || [];

  const describe = (el) => {
    if (!el || !el.tagName) return null;
    const info = { tag: el.tagName.toLowerCase() };
    if (el.id) info.id = String(el.id).slice(0, 60);
    if (el.name) info.name = String(el.name).slice(0, 60);
    try {
      const cls = String(el.className || '');
      if (cls) info.cls = cls.slice(0, 80);
    } catch {}
    const t = String((el.innerText || el.value || el.getAttribute('aria-label') || '')).replace(/\\s+/g, ' ').trim().slice(0, 80);
    if (t) info.text = t;
    if (el.tagName === 'A' && el.getAttribute('href')) info.href = String(el.getAttribute('href')).slice(0, 200);
    if (el.getAttribute('target')) info.target = el.getAttribute('target');
    if (el.type) info.type = el.type;
    return info;
  };

  const emit = (ev) => {
    try {
      ev.frm = location.href.slice(0, 200);
      ev.ts = new Date().toISOString();
      if (window.top === window) {
        window.__manualOpsQueue.push(ev);
      } else {
        window.parent.postMessage({ t: 'ux-obs', ev }, '*');
      }
    } catch {}
  };

  document.addEventListener('click', (e) => {
    const el = e.target?.closest?.('a, button, input, [role="button"], li, span, div, label') || e.target;
    emit({ kind: 'click', trusted: e.isTrusted, x: e.clientX, y: e.clientY, el: describe(el), real: describe(e.target) });
  }, true);

  document.addEventListener('submit', (e) => {
    emit({ kind: 'submit', trusted: e.isTrusted, el: describe(e.target) });
  }, true);

  // Chuyển trang SPA
  const pushHook = (kind) => {
    const orig = history[kind];
    history[kind] = function (...args) {
      emit({ kind: 'navigate', from: location.href.slice(0, 200), to: String(args[2] || '').slice(0, 200) });
      return orig.apply(this, args);
    };
  };
  pushHook('pushState');
  pushHook('replaceState');
  window.addEventListener('popstate', () => emit({ kind: 'navigate', from: '-', to: location.href.slice(0, 200) }));
  window.addEventListener('pagehide', () => emit({ kind: 'unload', to: location.href.slice(0, 200) }));

  // Gom message từ frame con (chỉ top-forward khi không phải top)
  window.addEventListener('message', (e) => {
    try {
      if (e.data && e.data.t === 'ux-obs' && e.data.ev) {
        if (window.top === window) window.__manualOpsQueue.push(e.data.ev);
        else window.parent.postMessage(e.data, '*');
      }
    } catch {}
  });
})();
`;

/**
 * Kích hoạt quan sát thao tác tay cho một context Playwright.
 *
 * @param {object} context BrowserContext Playwright.
 * @param {object} session Session app hiện tại (dùng session.id trong tên file).
 * @param {string} appDataDirectory Thư mục dữ liệu app (chứa /logs).
 * @param {object} [options={}] { intervalMs: chu kỳ poll, onLog: callback log }
 * @return {object} { stop(), filePath }
 * @author coder-nguoi-tay
 * @since 2026-10-25
 */
export function startManualOpsRecorder(context, session, appDataDirectory, options = {}) {
  const logsDir = join(appDataDirectory, 'logs');
  try { mkdirSync(logsDir, { recursive: true }); } catch {}
  const filePath = join(logsDir, `manual-ops-${(session.id || Date.now().toString(36)).slice(0, 12)}.jsonl`);
  const intervalMs = options.intervalMs || 3000;
  const maxFileBytes = 5 * 1024 * 1024;

  context.addInitScript(OBSERVER_INIT_SCRIPT).catch(() => {});
  // Các page đã tồn tại
  for (const p of context.pages()) {
    p.addInitScript(OBSERVER_INIT_SCRIPT).catch(() => {});
  }
  // Page mới
  context.on('page', (p) => {
    p.addInitScript(OBSERVER_INIT_SCRIPT).catch(() => {});
  });

  let stopped = false;
  const writeLines = (evs) => {
    if (!evs || evs.length === 0) return;
    try {
      if (statSync(filePath).size > maxFileBytes) {
        renameSync(filePath, filePath.replace(/\.jsonl$/, `-${Date.now()}.jsonl`));
      }
    } catch {}
    for (const ev of evs) {
      try { appendFileSync(filePath, JSON.stringify({ session: session.id || null, slot: session.slot || null, ...ev }) + '\n'); } catch {}
    }
  };

  const timer = setInterval(async () => {
    if (stopped) return;
    for (const page of context.pages()) {
      if (page.isClosed()) continue;
      // Poll từ top frame; các frame con đã đẩy qua postMessage vào top queue
      const evs = await page.evaluate(() => {
        const q = window.__manualOpsQueue || [];
        window.__manualOpsQueue = [];
        return q;
      }).catch(() => null);
      writeLines(evs);
    }
  }, intervalMs);

  return {
    filePath,
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
