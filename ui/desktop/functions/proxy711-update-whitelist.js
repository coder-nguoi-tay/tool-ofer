/**
 * Proxy711 update whitelist.
 * @return {Promise<void>} Kết quả xử lý proxy711 update whitelist.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function proxy711UpdateWhitelist() {
      const btn = document.getElementById('btn711Whitelist');
      if (btn) btn.disabled = true;
      const statusEl = document.getElementById('lbl711Status');
      if (statusEl) {
        statusEl.style.color = '#2563eb';
        statusEl.textContent = 'Đang kiểm tra IP & thêm vào 711proxy whitelist...';
      }
      try {
        const res = await api('/711proxy/update-whitelist', { method: 'POST' });
        if (res && res.ok) {
          if (res.ip && document.getElementById('lbl711MyIp')) {
            document.getElementById('lbl711MyIp').textContent = res.ip;
          }
          if (statusEl) {
            statusEl.style.color = '#15803d';
            statusEl.textContent = `✅ Đã thêm IP ${res.ip} vào Whitelist lúc ${new Date().toLocaleTimeString('vi-VN')}!`;
          }
          showWinAlert(`Đã thêm IP ${res.ip} vào whitelist 711proxy thành công!\nBạn có thể tạo và sử dụng proxy bình thường.`);
        } else {
          const err = res?.error || 'Không thể cập nhật whitelist.';
          if (statusEl) {
            statusEl.style.color = '#b91c1c';
            statusEl.textContent = `⚠️ ${err}`;
          }
          showWinAlert(`Lỗi cập nhật whitelist: ${err}`);
        }
      } catch (err) {
        if (statusEl) {
          statusEl.style.color = '#b91c1c';
          statusEl.textContent = `⚠️ Lỗi: ${err.message}`;
        }
        showWinAlert('Lỗi: ' + (err.message || err));
      } finally {
        if (btn) btn.disabled = false;
      }
    }
