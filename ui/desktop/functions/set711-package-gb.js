/**
 * Set711 package gb.
 * @param {*} gb gb.
 * @return {Promise<void>} Kết quả xử lý set711 package gb.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function set711PackageGb(gb) {
      try {
        const res = await api('/711proxy/package', {
          method: 'POST',
          body: JSON.stringify({ packageGb: gb })
        });
        if (res && res.ok) {
          update711BalanceDisplay(res.balance);
          toggle711PackageEdit(false);
          showWinAlert(`Đã cài đặt gói 711Proxy: ${gb} GB`);
        } else {
          showWinAlert('Lỗi: ' + (res?.error || 'Không lưu được cấu hình gói'));
        }
      } catch (err) {
        showWinAlert('Lỗi: ' + err.message);
      }
    }
