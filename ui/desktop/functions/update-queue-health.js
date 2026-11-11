/**
 * Update queue health.
 * @param {*} barId bar id.
 * @param {*} ready ready.
 * @param {*} used used.
 * @return {void} Kết quả xử lý update queue health.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function updateQueueHealth(barId, ready, used) {
      const readyEl = document.getElementById(`${barId}Ready`);
      const usedEl = document.getElementById(`${barId}Used`);
      const ratioEl = document.getElementById(`${barId}Ratio`);
      const total = (Number(ready) || 0) + (Number(used) || 0);
      if (total <= 0) {
        if (readyEl) readyEl.style.width = '0%';
        if (usedEl) usedEl.style.width = '0%';
        if (ratioEl) ratioEl.textContent = '0% sẵn sàng';
        return;
      }
      const readyPct = Math.round(((Number(ready) || 0) / total) * 100);
      const usedPct = 100 - readyPct;
      if (readyEl) readyEl.style.width = `${readyPct}%`;
      if (usedEl) usedEl.style.width = `${usedPct}%`;
      if (ratioEl) ratioEl.textContent = `${readyPct}% sẵn sàng (${ready}/${total})`;
    }
