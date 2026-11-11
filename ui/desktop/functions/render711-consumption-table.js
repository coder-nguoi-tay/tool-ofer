/**
 * Render711 consumption table.
 * @param {*} data data.
 * @return {void} Kết quả xử lý render711 consumption table.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function render711ConsumptionTable(data) {
      if (!data) return;
      const items = data.items || [];
      const totalFormatted = data.totalFormatted || formatBytes(data.totalBytes || 0);
      const peakFormatted = data.peakFormatted || '--';
      const peakHour = data.peakHour || '--';

      const tabCount = document.getElementById('bwTab711Count');
      if (tabCount) tabCount.textContent = `${items.filter(i => (i.bytes || 0) > 0).length} giờ`;

      const lblTotal = document.getElementById('lbl711ChartTotal');
      if (lblTotal) lblTotal.textContent = totalFormatted;

      const lblPeak = document.getElementById('lbl711ChartPeak');
      if (lblPeak) lblPeak.textContent = peakHour !== '--' ? `${peakHour} (${peakFormatted})` : '--';

      const tbody = document.getElementById('bwTable711Body');
      if (!tbody) return;

      if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:25px;color:#94a3b8;">Chưa ghi nhận tiêu hao 711 trong khoảng này (số liệu được ghi từ số dư 711 khi app đang mở).</td></tr>';
        return;
      }

      const maxBytes = Math.max(...items.map(i => i.bytes || 0), 1);

      tbody.innerHTML = items.map(item => {
        const bytes = item.bytes || 0;
        const isPeak = (data.peakBytes || 0) > 0 && bytes === data.peakBytes;
        const bgStyle = isPeak ? 'background:rgba(245,158,11,0.12);' : (bytes > 0 ? '' : 'color:#94a3b8;');
        const badgePeak = isPeak ? ' <span style="font-size:9.5px;background:rgba(245,158,11,0.25);color:#fbbf24;padding:1px 5px;border-radius:3px;font-weight:700;">Đỉnh</span>' : '';
        const barWidth = Math.min(100, Math.round((bytes / maxBytes) * 100));
        const barColor = isPeak ? 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)' : 'linear-gradient(90deg, #38bdf8 0%, #0284c7 100%)';
        const formattedStr = bytes > 0 ? `<b style="color:${isPeak ? '#fbbf24' : '#34d399'};font-size:12px;">${item.formatted || formatBytes(bytes)}</b>` : '<span style="color:#94a3b8;">0 B</span>';
        const bytesStr = bytes.toLocaleString();

        return `
          <tr style="${bgStyle}">
            <td style="font-weight:600;white-space:nowrap;">🕒 ${escHtml(item.localTime || item.period)}${badgePeak}</td>
            <td style="font-size:11px;color:#94a3b8;font-family:monospace;">${escHtml(item.period)}</td>
            <td style="text-align:right;">${formattedStr}</td>
            <td style="text-align:right;font-size:11px;color:#94a3b8;font-family:monospace;">${bytesStr} B</td>
            <td>
              <div style="display:flex;align-items:center;gap:8px;">
                <div style="flex:1;background:#1e293b;height:8px;border-radius:4px;overflow:hidden;">
                  <div style="background:${barColor};height:100%;width:${barWidth}%;"></div>
                </div>
                <span style="font-size:10px;color:#cbd5e1;min-width:35px;text-align:right;font-weight:600;">${item.percent || 0}%</span>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
