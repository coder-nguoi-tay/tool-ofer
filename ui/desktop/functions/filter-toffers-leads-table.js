/**
 * Filter toffers leads table.
 * @return {void} Kết quả xử lý filter toffers leads table.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function filterToffersLeadsTable() {
      const tbody = document.getElementById('dgvToffersLeadsBody');
      if (!tbody) return;

      const query = (document.getElementById('leadSearchInput')?.value || '').trim().toLowerCase();
      const list = toffersLeadsData.filter((item) => {
        if (!query) return true;
        const txt = `${item.id || ''} ${item.nameoff || ''} ${item.ip || ''} ${item.username || ''} ${item.fullname || ''} ${item.clickid || ''} ${item.geo || ''}`.toLowerCase();
        return txt.includes(query);
      });

      if (list.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="11" style="text-align:center;padding:30px;color:#94a3b8;">
              <div style="font-size:24px;margin-bottom:6px;">📭</div>
              <div>${toffersLeadsData.length === 0 ? 'Chưa có lead nào được ghi nhận trên toffers.top' : 'Không tìm thấy lead phù hợp với từ khóa'}</div>
            </td>
          </tr>
        `;
        return;
      }

      const leadStats = window.cachedLeadStats || {};

      tbody.innerHTML = list.map((item, idx) => {
        const timeStr = item.timelead ? new Date(Number(item.timelead) * 1000).toLocaleString('vi-VN') : '--';
        const flag = getGeoFlag(item.geo);
        const member = [item.fullname, item.username ? `(${item.username})` : ''].filter(Boolean).join(' ') || '--';
        const pointVal = Number(item.point) || 0;
        const pointBadge = pointVal > 0
          ? `<span style="display:inline-block;padding:1px 6px;border-radius:3px;background:rgba(16,185,129,0.18);border:1px solid rgba(16,185,129,0.35);color:#34d399;font-weight:700;font-size:11px;">+${item.point}</span>`
          : `<span style="display:inline-block;padding:1px 6px;border-radius:3px;background:#1e293b;color:#94a3b8;font-size:11px;">${item.point || '0'}</span>`;

        const cleanIp = String(item.ip || '').trim().replace(/:\d+$/, '').trim();
        const ipStat = leadStats[cleanIp] || leadStats[String(item.ip || '').trim()] || null;
        let progressBadge = `<span style="color:#94a3b8;font-size:11px;">--</span>`;
        if (ipStat) {
          const screenNum = ipStat.screen || ipStat.completedScreens || 0;
          const jumpNum = ipStat.jumpCount || ipStat.pageJumps || 0;
          progressBadge = `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;background:rgba(2,132,199,0.18);color:#38bdf8;font-weight:600;font-size:11px;border:1px solid rgba(56,189,248,0.3);" title="IP đã điền đến màn ${screenNum} và chuyển/nhảy trang ${jumpNum} lần">
            <span>📄 Màn ${screenNum}</span>
            <span style="color:#38bdf8;">•</span>
            <span>🔀 ${jumpNum} nhảy</span>
          </span>`;
        }

        return `
          <tr style="cursor:default;">
            <td style="text-align:center;color:#94a3b8;font-size:11px;">${idx + 1}</td>
            <td style="font-weight:600;color:#38bdf8;font-size:11px;">#${escHtml(item.id || '')}</td>
            <td style="font-weight:600;color:#f8fafc;" title="${escHtml(item.nameoff || '')}">${escHtml(item.nameoff || '--')}</td>
            <td style="text-align:center;">${pointBadge}</td>
            <td><code class="clickable-ip" onclick="copyToClipboard('${escHtml(item.ip || '')}', 'Đã sao chép IP: ${escHtml(item.ip || '')}')" title="Nhấn để sao chép IP">${escHtml(item.ip || '')}</code></td>
            <td style="text-align:center;">${progressBadge}</td>
            <td style="text-align:center;font-size:11px;" title="${escHtml(item.geo || '')}">${flag} ${escHtml(item.geo || '')}</td>
            <td style="color:#cbd5e1;font-size:11px;">${timeStr}</td>
            <td style="color:#94a3b8;font-size:10px;font-family:monospace;" title="${escHtml(item.clickid || '')}">${escHtml(item.clickid ? item.clickid.slice(0, 16) + '...' : '--')}</td>
            <td style="font-size:11px;color:#cbd5e1;">${escHtml(member)}</td>
            <td style="text-align:center;font-size:11px;color:#94a3b8;">${escHtml(item.network2 || '--')}</td>
          </tr>
        `;
      }).join('');
    }
