/**
 * Save active useragent.
 * @return {Promise<void>} Kết quả xử lý save active useragent.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function saveActiveUseragent() {
      const fileMap = {
        win: 'useragents.txt',
        mac: 'useragentMac.txt',
        lin: 'useragentLinux.txt',
        android: 'useragentAndroid.txt',
        iphone: 'useragentIphone.txt',
        ipad: 'useragentIpad.txt',
      };
      const filename = fileMap[currentUaTab];
      const content = document.getElementById('txtCfgUserAgent').value;
      const res = await api('/pc/browser-config/save', { method: 'POST', body: JSON.stringify({ file: filename, content }) });
      if (res.success) {
        alert(`Saved ${filename} successfully!`);
      } else {
        alert('Error: ' + res.error);
      }
    }
