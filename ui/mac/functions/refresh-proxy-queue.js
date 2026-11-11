/**
 * Refresh proxy queue.
 * @return {Promise<void>} Kết quả xử lý refresh proxy queue.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function refreshProxyQueue() {
      try {
        const data = await fetch('/proxy-queue').then((r) => r.json());
        pqAvailableCount.textContent = `Còn: ${data.available}`;
        pqUsedCount.textContent = `Đã dùng: ${data.used}`;
        if (data.used === 0) {
          pqUsedEmpty.hidden = false;
          pqUsedTbody.innerHTML = '';
        } else {
          pqUsedEmpty.hidden = true;
          pqUsedTbody.innerHTML = data.usedList.map((line, i) =>
            `<tr><td style="padding:3px 7px;border-bottom:1px solid #f0f2f7;color:#768197;">${i + 1}</td>`
            + `<td style="padding:3px 7px;border-bottom:1px solid #f0f2f7;">${escHtml(line)}</td></tr>`
          ).join('');
        }
      } catch {}
    }
