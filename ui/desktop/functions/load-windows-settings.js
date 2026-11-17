/**
     * Nạp cấu hình trình duyệt và trạng thái token GoLogin, không tải token về giao diện.
     * @return {Promise<void>} Hoàn tất cập nhật các trường Settings.
     * @throws {Error} Khi giao diện không đọc được cấu hình cục bộ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function loadWindowsSettings() {
      const data = await api('/pc/settings/read');
      syncBrowserChoice('Chrome', false);
      if (typeof applyGoLoginDeviceChoices === 'function') applyGoLoginDeviceChoices(data?.gologinDevices);
      const tokenInput = document.getElementById('gologinApiToken');
      if (tokenInput) tokenInput.placeholder = data?.gologinConfigured
        ? 'Đã lưu token — nhập để thay đổi' : 'Nhập token GoLogin';
      const tokenStatus = document.getElementById('gologinTokenStatus');
      if (tokenStatus) tokenStatus.textContent = data?.gologinConfigured
        ? 'Đã cấu hình token GoLogin. Để trống để giữ token hiện tại.'
        : 'Chưa có token GoLogin. Nhập token rồi bấm Lưu cài đặt.';


      const savedObscura = (() => {
        try { return localStorage.getItem('autolead_use_obscura'); } catch { return null; }
      })();
      if (savedObscura === '1' && typeof syncObscuraSetting === 'function') {
        syncObscuraSetting(true);
      } else {
        const savedGoLogin = (() => {
          try { return localStorage.getItem('autolead_use_gologin'); } catch { return null; }
        })();
        if (typeof syncGoLoginSetting === 'function') {
          syncGoLoginSetting(savedGoLogin === '1');
        }
      }


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
