/**
 * Check my public ip.
 * @return {Promise<*>} Kết quả xử lý check my public ip.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function checkMyPublicIp() {
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json').catch(() => null);
        if (ipRes && ipRes.ok) {
          const { ip } = await ipRes.json();
          if (ip) {
            window.myCurrentPublicIp = ip;
            const el = document.getElementById('lbl711MyIp');
            if (el) el.textContent = ip;
            return ip;
          }
        }
      } catch { }
      return null;
    }
