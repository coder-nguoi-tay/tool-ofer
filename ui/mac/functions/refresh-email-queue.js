/**
 * Refresh email queue.
 * @return {Promise<void>} Kết quả xử lý refresh email queue.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function refreshEmailQueue() {
      try {
        const data = await fetch('/email-queue').then((r) => r.json());
        eqAvailableCount.textContent = `Còn: ${data.available}`;
        eqUsedCount.textContent = `Đã dùng: ${data.used}`;
        if (data.used === 0) {
          eqUsedEmpty.hidden = false;
          eqUsedTbody.innerHTML = '';
        } else {
          eqUsedEmpty.hidden = true;
          eqUsedTbody.innerHTML = data.usedList.map((em, i) =>
            `<tr><td style="padding:3px 7px;border-bottom:1px solid #f0f2f7;color:#768197;">${i + 1}</td>`
            + `<td style="padding:3px 7px;border-bottom:1px solid #f0f2f7;font-family:ui-monospace,monospace;">${escHtml(em)}</td></tr>`
          ).join('');
        }
      } catch {}
    }
