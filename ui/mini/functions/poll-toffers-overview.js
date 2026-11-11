/**
 * Poll toffers overview.
 * @param {boolean} isManual is manual.
 * @return {Promise<void>} Kết quả xử lý poll toffers overview.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function pollToffersOverview(isManual = false) {
      const btn = document.getElementById('btnRefreshToffers');
      if (btn && isManual) {
        btn.disabled = true;
        btn.textContent = '⏳ Đang tải...';
      }
      try {
        const res = await fetch('/toffers/overview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ datas: '1504', forceRefresh: isManual }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.success) {
          const pt = (data.point !== null && data.point !== undefined) ? data.point : '--';
          const elTopPt = document.getElementById('topPointVal');
          if (elTopPt) elTopPt.textContent = `${pt} pt`;
          const elBigPt = document.getElementById('statTotalPointBig');
          if (elBigPt) elBigPt.textContent = `${pt} pt`;

          const results = data.results || [];
          const elLdCnt = document.getElementById('statToffersLeadsCount');
          if (elLdCnt) elLdCnt.textContent = `${results.length} leads`;
          const elBadge = document.getElementById('badgeLeadListCount');
          if (elBadge) elBadge.textContent = `${results.length} lead`;

          const container = document.getElementById('toffersLeadsContainer');
          if (container) {
            if (!results.length) {
              container.innerHTML = '<div style="color:#64748b; font-size:11px;">Chưa ghi nhận lead nào.</div>';
            } else {
              container.innerHTML = results.slice(0, 10).map((item) => {
                const timeStr = item.timelead ? new Date(Number(item.timelead) * 1000).toLocaleTimeString('vi-VN') : '--';
                const flag = item.geo === 'US' ? '🇺🇸' : (item.geo === 'GB' ? '🇬🇧' : '🌐');
                return `
                  <div style="background:#1e293b; border:1px solid #334155; border-radius:6px; padding:6px 8px; display:flex; align-items:center; justify-content:space-between; font-size:11px;">
                    <div style="max-width:70%;">
                      <div style="font-weight:700; color:#f1f5f9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${flag} ${item.nameoff || 'Offer'}
                      </div>
                      <div style="font-size:10px; color:#94a3b8; font-family:monospace;">
                        IP: ${item.ip || '--'} • #${item.id || ''} • ${timeStr}
                      </div>
                    </div>
                    <div style="background:rgba(34,197,94,0.15); border:1px solid rgba(34,197,94,0.4); color:#22c55e; font-weight:800; font-size:12px; padding:2px 8px; border-radius:4px;">
                      +${item.point || '0'} pt
                    </div>
                  </div>
                `;
              }).join('');
            }
          }
          if (isManual) showToast(`Đã làm mới: ${pt} point (${results.length} leads)`);
        }
      } catch (err) {
      } finally {
        if (btn && isManual) {
          btn.disabled = false;
          btn.textContent = '🔄 Làm mới Point';
        }
      }
    }
