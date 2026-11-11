/**
 * Proxy711 save auto refill.
 * @return {Promise<void>} Kết quả xử lý proxy711 save auto refill.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function proxy711SaveAutoRefill() {
      await api('/711proxy/autorefill', {
        method: 'POST',
        body: JSON.stringify({
          enabled: document.getElementById('chk711AutoRefill').checked,
          region: document.getElementById('sel711Region').value,
          count: parseInt(document.getElementById('inp711Count').value) || 50,
          sessTime: parseInt(document.getElementById('inp711SessTime').value) || 20,
          sessAuto: document.getElementById('chk711SessAuto').checked,
        }),
      });
    }
