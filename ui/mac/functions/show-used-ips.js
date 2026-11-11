/**
     * Hiện bảng các IP exit đã dùng để biết IP nào sẽ bị từ chối ở lượt sau.
     * @return {Promise<void>} Hoàn tất khi bảng đã được vẽ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function showUsedIps() {
      const result = await send('/used-ips', 'Đang đọc lịch sử IP exit…');
      usedIpsBox.textContent = '';
      if (!result?.ips?.length) return;
      const table = document.createElement('table');
      const head = table.insertRow();
      for (const title of ['IP exit', 'Proxy', 'Trạng thái', 'Lần dùng cuối', 'Số lần']) {
        const cell = document.createElement('th');
        cell.textContent = title;
        head.append(cell);
      }
      for (const entry of result.ips) {
        const row = table.insertRow();
        const usedAt = entry.usedAt ? new Date(entry.usedAt).toLocaleString('vi-VN') : '—';
        for (const value of [entry.exitIp, entry.proxy, entry.status, usedAt, String(entry.uses)]) {
          row.insertCell().textContent = value;
        }
        row.cells[2].className = entry.status === 'success' ? 'ok' : 'bad';
      }
      usedIpsBox.append(table);
    }
