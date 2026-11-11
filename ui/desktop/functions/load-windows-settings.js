/**
     * Nạp cấu hình trình duyệt và fingerprint từ Settings.ini.
     * @return {Promise<void>} Hoàn tất cập nhật các trường Settings.
     * @throws {Error} Khi giao diện không đọc được cấu hình cục bộ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadWindowsSettings() {
      const data = await api('/pc/settings/read');
      syncBrowserChoice('Chrome', false);

      const savedCloak = (() => {
        try { return localStorage.getItem('autolead_use_cloakbrowser'); } catch { return null; }
      })();
      const cloakEnabled = savedCloak !== null ? savedCloak === '1' : Boolean(data?.CloakBrowser);
      syncCloakBrowserSetting(cloakEnabled);

      api('/cloakbrowser/status').then((status) => {
        const el = document.getElementById('cloakBrowserStatusNotice');
        if (el && status) {
          if (status.installed) {
            el.innerHTML = `● CloakBrowser ${status.version || ''} (${status.platform}) đã sẵn sàng trên hệ thống`;
            el.style.color = '#28a745';
          } else {
            el.innerHTML = `○ CloakBrowser chưa tải binary. Khi bấm Start, app sẽ tự động tải phiên bản stealth thích hợp.`;
            el.style.color = '#d97706';
          }
        }
      }).catch(() => { });

      if (data) {
        if (data.Canvas !== undefined) document.getElementById('CheckBoxCanvas').checked = data.Canvas;
        if (data.ClientRects !== undefined) document.getElementById('CheckboxClientRects').checked = data.ClientRects;
        if (data.WebGLImage !== undefined) document.getElementById('CheckBoxWebGLImage').checked = data.WebGLImage;
        if (data.Fonts !== undefined) document.getElementById('CheckboxFonts').checked = data.Fonts;
        if (data.WebRTC !== undefined) document.getElementById('CheckBoxWebRTC').checked = data.WebRTC;
        if (data.ApiFakeIP !== undefined) document.getElementById('CheckBoxGetApiPake').checked = data.ApiFakeIP;
        if (data.Windows !== undefined) document.getElementById('chkWindows').checked = data.Windows;
        if (data.Mac !== undefined) document.getElementById('chkMac').checked = data.Mac;
        if (data.Linux !== undefined) document.getElementById('chkLinux').checked = data.Linux;
        if (data.Android !== undefined) document.getElementById('chkAndroid').checked = data.Android;
        if (data.iPhone !== undefined) document.getElementById('chkIphone').checked = data.iPhone;
        if (data.iPad !== undefined) document.getElementById('chkIpad').checked = data.iPad;
      }
    }
