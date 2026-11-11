/**
 * Proxy711 login.
 * @return {Promise<void>} Kết quả xử lý proxy711 login.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function proxy711Login() {
      const username = document.getElementById('inp711User').value.trim();
      const passwd = document.getElementById('inp711Pass').value;
      if (!username || !passwd) { showWinAlert('Vui lòng nhập username và password.'); return; }
      document.getElementById('lbl711Balance').textContent = 'Đang đăng nhập...';
      const res = await api('/711proxy/login', { method: 'POST', body: JSON.stringify({ username, passwd }) });
      if (res && res.ok) {
        if (passwd) document.getElementById('inp711Pass').value = passwd;
        document.getElementById('lbl711Balance').textContent = 'Đã lưu mật khẩu & đăng nhập thành công ✓';
        if (res.whitelist) {
          const st = document.getElementById('lbl711Status');
          if (res.whitelist.ok) {
            if (st) {
              st.style.color = '#15803d';
              st.textContent = `✅ Đã whitelist IP ${res.whitelist.ip} ✓`;
            }
          } else if (res.whitelist.error) {
            if (st) {
              st.style.color = '#b91c1c';
              st.textContent = `⚠️ Whitelist: ${res.whitelist.error}`;
            }
          }
        }
        proxy711FetchBalance(true);
      } else {
        document.getElementById('lbl711Balance').textContent = '';
        showWinAlert('Lỗi đăng nhập: ' + (res?.error || 'Không xác định'));
      }
    }
