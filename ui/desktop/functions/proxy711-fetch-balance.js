/**
 * Proxy711 fetch balance.
 * @param {boolean} force force.
 * @return {Promise<void>} Kết quả xử lý proxy711 fetch balance.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function proxy711FetchBalance(force = false) {
      try {
        const url = force ? '/711proxy/balance?refresh=1' : '/711proxy/balance';
        const res = await api(url);
        if (res) {
          update711BalanceDisplay(res);
        }
      } catch (err) {
        console.warn('Lỗi lấy số dư 711proxy:', err);
      }
    }
