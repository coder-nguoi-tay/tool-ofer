/**
 * Đóng trình duyệt của một slot; ô Screen View hiện "Đang tắt" ngay khi bấm và trở lại nếu server báo lỗi.
 * @param {number} slot slot.
 * @return {Promise<void>} Kết quả xử lý close single browser.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10 (cập nhật 2026-11-21)
 */
async function closeSingleBrowser(slot) {
      document.getElementById('lbStatus').textContent = `Đang tắt trình duyệt Slot ${slot}...`;
      const tile = document.querySelector(`#thumbnailTiles [data-slot="${slot}"]`);
      if (tile) {
        tile.dataset.closing = '1';
        tile.style.opacity = '0.45';
        tile.style.pointerEvents = 'none';
        const label = document.createElement('div');
        label.className = 'tile-closing-label';
        label.textContent = 'Đang tắt…';
        label.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fca5a5;';
        tile.appendChild(label);
      }
      const res = await api(`/browser/close/${slot}`, { method: 'POST' }).catch((err) => ({ error: err.message }));
      document.getElementById('lbStatus').textContent = res?.error ? `Lỗi tắt Slot ${slot}: ${res.error}` : `✓ Đã tắt trình duyệt Slot ${slot}.`;
      if (res?.error && tile) {
        delete tile.dataset.closing;
        tile.style.opacity = '';
        tile.style.pointerEvents = '';
        tile.querySelector('.tile-closing-label')?.remove();
      }
      fetchRunningState();
    }
