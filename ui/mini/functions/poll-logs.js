/**
 * Poll logs: chỉ tải phần log mới (since/epoch như desktop), gộp vào miniStatsState rồi vẽ lại Log + hoạt động AI.
 * @return {Promise<void>} Kết quả xử lý poll logs.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function pollLogs() {
      try {
        const st = miniStatsState;
        const since = st.logSeq > 0 ? `?since=${st.logSeq}&epoch=${encodeURIComponent(st.logEpoch)}` : '';
        const res = await fetch(`/browser-logs${since}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data || !data.sessions) return;
        const merged = miniStatsMergeLogDelta(st.logs, data);
        st.logs = merged.logData;
        st.logSeq = data.seq || 0;
        st.logEpoch = data.epoch ?? '';
        const info = document.getElementById('stLogHtmlInfo');
        if (info) info.textContent = `📁 ${data.htmlCount ?? 0} file HTML · ${data.htmlDir || '...'}`;
        if (!merged.changed) return;
        miniStatsRenderLogs();
        miniStatsRenderAiActivity();
      } catch (e) {}
    }
