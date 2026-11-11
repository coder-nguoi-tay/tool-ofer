import { FORM_VISIBILITY_OBSERVER_SCRIPT } from './form-visibility-observer-script.mjs';
import { BROWSER_INPUT_OBSERVER_SCRIPT } from './browser-input-observer-script.mjs';

/**
 * Ghi hành động tại nguồn; ưu tiên gửi ngay qua binding để không mất khi chuyển trang.
 */
const OBSERVER_INIT_SCRIPT = `
(() => {
  if (window.__uxObsInit) return;
  window.__uxObsInit = true;
  window.__manualOpsQueue = window.__manualOpsQueue || [];

  /**
   * Mô tả mục tiêu thao tác, giữ định danh và trạng thái thay cho dữ liệu nhập.
   * @param {Element} el Phần tử phát sinh hành động.
   * @return {object|null} Mô tả giới hạn của phần tử.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-10
   */
  const describe = (el) => {
    if (!el || !el.tagName) return null;
    const info = { tag: el.tagName.toLowerCase() };
    if (el.id) info.id = String(el.id).slice(0, 60);
    if (el.name) info.name = String(el.name).slice(0, 60);
    try {
      const cls = String(el.className || '');
      if (cls) info.cls = cls.slice(0, 80);
    } catch {}
    const editable = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    const t = String((editable ? el.getAttribute('aria-label') : el.innerText || el.getAttribute('aria-label')) || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
    if (t) info.text = t;
    if (el.tagName === 'A' && el.getAttribute('href')) info.href = String(el.getAttribute('href')).slice(0, 200);
    if (el.getAttribute('target')) info.target = el.getAttribute('target');
    if (el.type) info.type = el.type;
    if (editable) info.filled = Boolean(el.value);
    if (el.type === 'checkbox' || el.type === 'radio') info.checked = el.checked;
    return info;
  };

  /**
   * Gửi sự kiện ngay về recorder, dùng hàng đợi dự phòng khi binding không khả dụng.
   * @param {object} ev Hành động hoặc trạng thái form đã quan sát.
   * @return {void} Chuyển sự kiện sang context chủ quản.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-10
   */
  const emit = (ev) => {
    try {
      ev.frm = location.href.slice(0, 200);
      ev.ts = new Date().toISOString();
      if (typeof window.__autoleadBrowserEvent === 'function') {
        window.__autoleadBrowserEvent(ev).catch(() => {});
        return;
      }
      if (window.top === window) {
        window.__manualOpsQueue.push(ev);
        if (window.__manualOpsQueue.length > 200) window.__manualOpsQueue.shift();
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

  document.addEventListener('change', (e) => {
    emit({ kind: 'change', trusted: e.isTrusted, el: describe(e.target) });
  }, true);
  ${BROWSER_INPUT_OBSERVER_SCRIPT}
  ${FORM_VISIBILITY_OBSERVER_SCRIPT}
  document.addEventListener('keydown', (e) => {
    if (['Enter', 'Tab', 'Escape'].includes(e.key)) emit({ kind: 'keydown', key: e.key, trusted: e.isTrusted, el: describe(e.target) });
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
export { OBSERVER_INIT_SCRIPT };
