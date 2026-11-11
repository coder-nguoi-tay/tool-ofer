/**
 * Init.
 * @return {Promise<void>} Kết quả xử lý init.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function init() {
      await Promise.allSettled([
        loadOfferConfig(),
        loadProxyQueue(),
        proxy711Init(),
        loadScriptList(),
        loadScriptRrsList(),
        loadCommandsPalette(),
        loadHelpContent(),
        loadProxyFile('proxy.txt', 'txtCfgProxy'),
        loadProxyFile('micro.txt', 'txtCfgMicro'),
        loadProxyFile('ssh.txt', 'txtCfgSsh'),
        loadProxyFile('tinsoft.txt', 'txtCfgTinsoft'),
        loadProxyFile('Socks4G.txt', 'txtCfgSocks4g'),
        loadProxyFile('proxyHung.txt', 'txtCfgProxyHung'),
        loadActiveUseragent(),
        loadBrowserConfigFile('refferent.txt', 'txtCfgRefferent'),
        loadBrowserConfigFile('bookmarks.txt', 'txtCfgBookmarks'),
        loadEmailList(),
        loadAutoRefillConfig(),
        loadAutofillList(),
        loadWindowsSettings(),
        loadAiConfigUi(),
        fetchLogs(),
        fetchToffersLeads(false),
      ]);
      syncOptionPills();
      setInterval(fetchRunningState, 1500);
    }
