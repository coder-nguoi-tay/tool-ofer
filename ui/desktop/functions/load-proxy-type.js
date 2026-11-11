/**
 * Load proxy type.
 * @param {*} type type.
 * @return {Promise<void>} Kết quả xử lý load proxy type.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadProxyType(type) {
      const map = {
        proxy: 'proxy.txt',
        micro: 'micro.txt',
        ssh: 'ssh.txt',
        tinsoft: 'tinsoft.txt',
        socks4g: 'Socks4G.txt',
        proxyHung: 'proxyHung.txt',
      };
      if (map[type]) {
        const res = await api('/pc/config/read', { method: 'POST', body: JSON.stringify({ file: map[type] }) });
        if (res && res.content !== undefined) {
          document.getElementById('txtDashboardProxy').value = res.content;
        }
      } else if (type === 'direct') {
        document.getElementById('txtDashboardProxy').value = '';
      }
    }
