/**
 * Fetch logs.
 * @return {Promise<void>} Kết quả xử lý fetch logs.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function fetchLogs() {
      try {
        // Chỉ tải phần mới (đo 2026-11-13: tải đủ là 5 MB mỗi 2 giây, nặng cả node lẫn giao diện).
        const since = fetchLogs._seq > 0 ? `?since=${fetchLogs._seq}&epoch=${fetchLogs._epoch}` : '';
        const res = await api(`/browser-logs${since}`);
        if (!res || !res.sessions) return;
        const merged = mergeLogDelta(logData, res);
        logData = merged.logData;
        fetchLogs._seq = res.seq;
        fetchLogs._epoch = res.epoch;
        logStorageDir = res.htmlDir || '';
        const dirEl = document.getElementById('logHtmlDir');
        const countEl = document.getElementById('logHtmlCount');
        if (dirEl) dirEl.textContent = logStorageDir || '...';
        const htmlCountChanged = countEl && countEl.textContent !== String(res.htmlCount ?? 0);
        if (countEl) countEl.textContent = res.htmlCount ?? 0;
        // Không có gì mới thì không dựng lại danh sách (tự làm mới 2s/lần làm tab Log giật và nhảy vị trí cuộn).
        if (!merged.changed && !htmlCountChanged) return;
        renderLogs();
        renderAiActivityGrid();
      } catch { }
    }
