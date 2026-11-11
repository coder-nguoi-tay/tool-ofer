/**
 * Fetch logs.
 * @return {Promise<void>} Kết quả xử lý fetch logs.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function fetchLogs() {
      try {
        const data = await fetch('/browser-logs').then((r) => r.json());
        if (data && data.sessions) {
          logData = data.sessions;
          logStorageDir = data.htmlDir || '';
          const infoEl = document.querySelector('#log-storage-info');
          if (infoEl && logStorageDir) {
            infoEl.innerHTML = `📁 Thư mục lưu HTML: <code style="background:#e2e8f0;padding:2px 5px;border-radius:3px;">${escHtml(logStorageDir)}</code> (<strong id="log-html-count">${data.htmlCount ?? 0}</strong> file)`;
          }
        } else if (Array.isArray(data)) {
          logData = data;
        }
        renderLogs();
      } catch {}
    }
