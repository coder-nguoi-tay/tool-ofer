/**
 * Proxy711 generate.
 * @return {Promise<void>} Kết quả xử lý proxy711 generate.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function proxy711Generate() {
      const btn = document.getElementById('btn711Generate');
      if (btn.disabled) return;
      const isSubuser = document.getElementById('rd711ModeSubuser')?.checked;
      const authMode = isSubuser ? 'subuser' : 'api';
      const subuser = document.getElementById('inp711SubUser')?.value?.trim() || '';
      const subpass = document.getElementById('inp711SubPass')?.value || '';
      const gateway = document.getElementById('sel711Gateway')?.value || '';

      if (isSubuser && (!subuser || !subpass)) {
        showWinAlert('Vui lòng nhập Tên Sub-user và Mật khẩu sub-user 711Proxy.\n(Tạo tài khoản con tại https://dashboard.711proxy.com/sub-user)');
        return;
      }

      const region = document.getElementById('sel711Region').value;
      const count = parseInt(document.getElementById('inp711Count').value) || 50;
      const sessTime = parseInt(document.getElementById('inp711SessTime').value) || 20;
      const sessAuto = document.getElementById('chk711SessAuto').checked;

      // Lưu cài đặt hiện tại vào auto-refill config
      await api('/711proxy/autorefill', {
        method: 'POST',
        body: JSON.stringify({
          enabled: document.getElementById('chk711AutoRefill').checked,
          region, count, sessTime, sessAuto,
        }),
      });

      btn.disabled = true;
      const stEl = document.getElementById('lbl711Status');
      if (stEl) {
        stEl.style.color = '#2563eb';
        stEl.textContent = `Đang tạo ${count} proxy (${isSubuser ? 'User & Pass' : 'API'})...`;
      }

      const res = await api('/711proxy/generate', {
        method: 'POST',
        body: JSON.stringify({
          authMode,
          subuser,
          subpass,
          gateway,
          region,
          count,
          sessTime,
          sessAuto,
        }),
      });
      btn.disabled = false;
      if (res && res.added !== undefined) {
        if (stEl) {
          stEl.style.color = '#15803d';
          stEl.textContent = `✅ Đã tạo ${res.added} proxy (${res.authMode === 'subuser' ? 'User:Pass' : 'API'}) lúc ${new Date().toLocaleTimeString('vi-VN')}!`;
        }
        await loadProxyQueue();
        showWinAlert(res.message);
      } else {
        const err = res?.error || 'Không xác định';
        if (stEl) {
          stEl.style.color = '#b91c1c';
          stEl.textContent = `⚠️ Lỗi: ${err}`;
        }
        showWinAlert('Lỗi tạo proxy: ' + err);
      }
    }
