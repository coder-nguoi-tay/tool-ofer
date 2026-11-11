/**
 * Fetch logs.
 * @return {Promise<void>} Kết quả xử lý fetch logs.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function fetchLogs() {
      try {
        const res = await api('/browser-logs');
        if (res && res.sessions) {
          logData = res.sessions;
          logStorageDir = res.htmlDir || '';
          const dirEl = document.getElementById('logHtmlDir');
          const countEl = document.getElementById('logHtmlCount');
          if (dirEl) dirEl.textContent = logStorageDir || '...';
          if (countEl) countEl.textContent = res.htmlCount ?? 0;
        } else if (Array.isArray(res)) {
          logData = res;
        }
        // Log không đổi thì không dựng lại danh sách (tự làm mới 2s/lần làm tab Log giật và nhảy vị trí cuộn).
        const logKey = `${JSON.stringify(logData).length}:${res?.htmlCount ?? 0}`;
        if (logKey === fetchLogs._lastKey) return;
        fetchLogs._lastKey = logKey;
        renderLogs();
        renderAiActivityGrid();
      } catch { }
    }
