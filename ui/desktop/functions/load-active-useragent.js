/**
 * Load active useragent.
 * @return {Promise<void>} Kết quả xử lý load active useragent.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadActiveUseragent() {
      const fileMap = {
        win: 'useragents.txt',
        mac: 'useragentMac.txt',
        lin: 'useragentLinux.txt',
        android: 'useragentAndroid.txt',
        iphone: 'useragentIphone.txt',
        ipad: 'useragentIpad.txt',
      };
      const titleMap = {
        win: 'Useragent Windows:',
        mac: 'Useragent Mac:',
        lin: 'Useragent Linux:',
        android: 'Useragent Android:',
        iphone: 'Useragent iPhone:',
        ipad: 'Useragent iPad:',
      };
      document.getElementById('lbUaTitle').textContent = titleMap[currentUaTab] || 'Useragent:';
      const filename = fileMap[currentUaTab];
      const res = await api('/pc/browser-config/read', { method: 'POST', body: JSON.stringify({ file: filename }) });
      if (res && res.content !== undefined) {
        document.getElementById('txtCfgUserAgent').value = res.content;
      }
    }
