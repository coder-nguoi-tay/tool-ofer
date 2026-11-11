/**
 * Vẽ con trỏ riêng trong trang và duy trì qua DOM tải chậm hoặc bị thay thế.
 * Hàm chạy trong browser nên chỉ dùng DOM và payload đã tuần tự hóa.
 * @param {object} position Tọa độ, trạng thái nhấn và cờ đăng ký theo dõi trang.
 * @return {void} Hiện một con trỏ ở main frame, không nhận hoặc chặn click.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function updateBrowserMousePointer({ x = 24, y = 24, pressed = false, track = false } = {}) {
  if (window.top !== window) return;
  const state = window.__autoleadpcMousePointerState ||= { x, y, pressed };
  Object.assign(state, { x, y, pressed });
  /**
   * Tạo lại con trỏ nếu website xóa DOM và giữ hình vẽ tách khỏi CSS của offer.
   * @return {void} Cập nhật con trỏ tại vị trí cuối cùng trong viewport.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-12
   */
  const draw = () => {
    if (!document.documentElement) return;
    let pointer = document.querySelector('[data-autoleadpc-mouse-pointer]');
    if (!pointer) {
      pointer = document.createElement('autoleadpc-mouse-pointer');
      pointer.setAttribute('data-autoleadpc-mouse-pointer', '');
      pointer.setAttribute('aria-hidden', 'true');
      pointer.style.cssText = 'all:initial!important;position:fixed!important;left:0!important;top:0!important;width:24px!important;height:32px!important;display:block!important;visibility:visible!important;opacity:1!important;z-index:2147483647!important;pointer-events:none!important;';
      const shadow = pointer.attachShadow({ mode: 'open' });
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 18 25');
      svg.setAttribute('width', '24');
      svg.setAttribute('height', '32');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M1 1V20L6 15L10 23L14 21L10 13H17Z');
      path.setAttribute('stroke', '#111827');
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);
      shadow.appendChild(svg);
      document.documentElement.appendChild(pointer);
    }
    const pointerX = Math.max(0, Math.min(state.x, Math.max(0, window.innerWidth - 24)));
    const pointerY = Math.max(0, Math.min(state.y, Math.max(0, window.innerHeight - 32)));
    pointer.style.setProperty('transform', `translate(${pointerX}px, ${pointerY}px)`, 'important');
    pointer.shadowRoot?.querySelector('path')?.setAttribute('fill', state.pressed ? '#38bdf8' : '#ffffff');
    pointer.setAttribute('data-pressed', state.pressed ? '1' : '0');
    if (state.observedRoot !== document.documentElement) {
      state.rootObserver?.disconnect();
      state.observedRoot = document.documentElement;
      state.rootObserver = new MutationObserver(() => {
        if (!document.querySelector('[data-autoleadpc-mouse-pointer]')) draw();
      });
      state.rootObserver.observe(document.documentElement, { childList: true });
    }
  };
  if (track && !state.tracking) {
    state.tracking = true;
    document.addEventListener('mousemove', event => { Object.assign(state, { x: event.clientX, y: event.clientY }); draw(); }, { passive: true });
    document.addEventListener('mousedown', () => { state.pressed = true; draw(); }, { passive: true });
    document.addEventListener('mouseup', () => { state.pressed = false; draw(); }, { passive: true });
    document.addEventListener('DOMContentLoaded', draw, { once: true });
    // Chỉ quan sát con trực tiếp của document để không quét lại mỗi mutation của form.
    new MutationObserver(draw).observe(document, { childList: true });
  }
  draw();
}
