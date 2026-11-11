/**
 * Refresh autofill queue.
 * @return {Promise<void>} Kết quả xử lý refresh autofill queue.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function refreshAutofillQueue() {
      try {
        const { available, used, usedList } = await fetch('/autofill-queue').then((r) => r.json());
        aqAvailableCount.textContent = `Còn: ${available}`;
        aqUsedCount.textContent = `Đã dùng: ${used}`;
        if (usedList.length === 0) {
          aqUsedEmpty.hidden = false;
          aqUsedHead.innerHTML = '';
          aqUsedBody.innerHTML = '';
        } else {
          aqUsedEmpty.hidden = true;
          const cols = [...new Set(usedList.flatMap(Object.keys))];
          aqUsedHead.innerHTML = cols.map((c) =>
            `<th style="position:sticky;top:0;background:#f7f9fc;color:#768197;font-weight:600;padding:5px 7px;border-bottom:1px solid #e7ebf2;white-space:nowrap;">${escHtml(c)}</th>`
          ).join('');
          aqUsedBody.innerHTML = usedList.map((r) =>
            `<tr>${cols.map((c) => `<td style="padding:4px 7px;border-bottom:1px solid #f0f2f7;white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis;">${escHtml(r[c] ?? '')}</td>`).join('')}</tr>`
          ).join('');
        }
      } catch {}
    }
