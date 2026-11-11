/**
 * Save711 subuser config.
 * @param {boolean} notify notify.
 * @return {Promise<void>} Kết quả xử lý save711 subuser config.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function save711SubuserConfig(notify = false) {
      const subuser = document.getElementById('inp711SubUser')?.value?.trim();
      const subpass = document.getElementById('inp711SubPass')?.value;
      const gateway = document.getElementById('sel711Gateway')?.value || 'global.rotgbapi.trustsource.live:10000';
      const [gatewayHost, gatewayPort] = gateway.split(':');
      const res = await api('/711proxy/config', {
        method: 'POST',
        body: JSON.stringify({
          authMode: 'subuser',
          subuser,
          subpass,
          gatewayHost,
          gatewayPort: parseInt(gatewayPort) || 10000,
        }),
      });
      if (notify) {
        if (res && res.ok) showWinAlert('Đã lưu cấu hình Sub-user 711Proxy thành công!');
        else showWinAlert('Lỗi: ' + (res?.error || 'Không lưu được'));
      }
    }
