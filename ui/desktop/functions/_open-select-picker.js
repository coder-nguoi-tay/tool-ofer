/**
 * Hiện danh sách của ô vừa bấm trong Screen View và gửi lựa chọn tới đúng ô đó.
 * @param {number} slot Slot đang được điều khiển.
 * @param {{uid: string, options: object[], selectedIndex: number}} select Danh sách lựa chọn do trang trả về.
 * @param {number} clientX Tọa độ ngang của chuột trong giao diện.
 * @param {number} clientY Tọa độ dọc của chuột trong giao diện.
 * @return {void} Hiện bộ chọn tại vị trí bấm.
 * @throws {Error} Khi không thể dựng hoặc gắn danh sách chọn vào DOM.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function _openSelectPicker(slot, select, clientX, clientY) {
      _closeSelectPicker();
      const screenSourceId = document.getElementById('screenCanvas')?.dataset.screenSourceId;
      const box = document.createElement('div');
      box.id = 'screenSelectPicker';
      box.style.cssText = 'position:fixed;z-index:99999;min-width:180px;max-width:360px;max-height:320px;overflow:auto;'
        + 'background:#131d31;color:#f8fafc;border:1px solid #22324e;border-radius:6px;box-shadow:0 10px 25px rgba(0,0,0,.6);font:12px -apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;';
      select.options.forEach((opt, index) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.disabled = Boolean(opt.disabled);
        item.textContent = opt.label || '(trống)';
        item.style.cssText = 'display:block;width:100%;text-align:left;border:0;background:transparent;color:inherit;font:inherit;padding:6px 10px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
          + (index === select.selectedIndex ? 'background:rgba(2,132,199,0.25);color:#38bdf8;font-weight:600;' : '')
          + (opt.disabled ? 'color:#64748b;cursor:default;' : '');
        if (!opt.disabled) {
          item.onmouseenter = () => { if (index !== select.selectedIndex) item.style.background = '#1e293b'; };
          item.onmouseleave = () => { if (index !== select.selectedIndex) item.style.background = ''; };
          item.onclick = async () => {
            _closeSelectPicker();
            const result = await api(`/screen/input/${slot}`, {
              method: 'POST', body: JSON.stringify({ type: 'select', screenSourceId, uid: select.uid, index })
            });
            if (!result?.ok) showToast(result?.error || 'Không áp dụng được lựa chọn. Hãy mở lại danh sách.', 'error');
          };
        }
        box.appendChild(item);
      });
      document.body.appendChild(box);
      const left = Math.max(8, Math.min(clientX, window.innerWidth - box.offsetWidth - 8));
      const top = clientY + box.offsetHeight + 8 > window.innerHeight ? Math.max(8, clientY - box.offsetHeight) : clientY;
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.children[select.selectedIndex]?.scrollIntoView({ block: 'nearest' });
      box.dismissListeners = new AbortController();
      const listenerOptions = { capture: true, signal: box.dismissListeners.signal };
      document.addEventListener('mousedown', event => {
        if (!box.contains(event.target)) _closeSelectPicker();
      }, listenerOptions);
      document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        _closeSelectPicker();
      }, listenerOptions);
    }
