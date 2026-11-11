/**
 *  open select picker.
 * @param {number} slot slot.
 * @param {*} select select.
 * @param {*} clientX client x.
 * @param {*} clientY client y.
 * @return {void} Kết quả xử lý  open select picker.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function _openSelectPicker(slot, select, clientX, clientY) {
      _closeSelectPicker();
      const box = document.createElement('div');
      box.id = 'screenSelectPicker';
      box.style.cssText = 'position:fixed;z-index:99999;min-width:180px;max-width:360px;max-height:320px;overflow:auto;'
        + 'background:#131d31;color:#f8fafc;border:1px solid #22324e;border-radius:6px;box-shadow:0 10px 25px rgba(0,0,0,.6);font:12px -apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;';
      select.options.forEach((opt, index) => {
        const item = document.createElement('div');
        item.textContent = opt.label || '(trống)';
        item.style.cssText = 'padding:6px 10px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
          + (index === select.selectedIndex ? 'background:rgba(2,132,199,0.25);color:#38bdf8;font-weight:600;' : '')
          + (opt.disabled ? 'color:#64748b;cursor:default;' : '');
        if (!opt.disabled) {
          item.onmouseenter = () => { if (index !== select.selectedIndex) item.style.background = '#1e293b'; };
          item.onmouseleave = () => { if (index !== select.selectedIndex) item.style.background = ''; };
          item.onmousedown = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            _closeSelectPicker();
            _sendInput(slot, { type: 'select', index });
          };
        }
        box.appendChild(item);
      });
      document.body.appendChild(box);
      const left = Math.max(8, Math.min(clientX, window.innerWidth - box.offsetWidth - 8));
      const top = clientY + box.offsetHeight + 8 > window.innerHeight ? Math.max(8, clientY - box.offsetHeight) : clientY;
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.querySelector('[style*="dbeafe"]')?.scrollIntoView({ block: 'nearest' });
      // Click ra ngoài hoặc bấm Esc thì đóng danh sách.
      setTimeout(() => {
        const close = (ev) => {
          if (ev.type === 'keydown' && ev.key !== 'Escape') return;
          if (ev.type === 'mousedown' && box.contains(ev.target)) return;
          _closeSelectPicker();
          document.removeEventListener('mousedown', close, true);
          document.removeEventListener('keydown', close, true);
        };
        document.addEventListener('mousedown', close, true);
        document.addEventListener('keydown', close, true);
      }, 0);
    }
