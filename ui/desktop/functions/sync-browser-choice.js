/**
     * Đồng bộ giao diện chỉ báo trình duyệt Google Chrome.
     * @param {string} [mode='Chrome'] Chế độ trình duyệt.
     * @param {boolean} [shouldSave=false] Có ghi lại Settings.ini ngay hay không.
     * @return {void} Cập nhật trạng thái trình duyệt trên giao diện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function syncBrowserChoice(mode = 'Chrome', shouldSave = false) {
      // Chrome is the sole standard browser engine
      const dashChrome = document.getElementById('dashRadioChrome');
      if (dashChrome) dashChrome.checked = true;

      const lblChrome = document.getElementById('lblBrowserChrome');
      if (lblChrome) {
        lblChrome.style.color = '#38bdf8';
        lblChrome.style.background = '#0b1324';
        lblChrome.style.boxShadow = '0 1px 2px rgba(0,0,0,0.4)';
      }

      // Update Settings radios if present
      const radChrome = document.getElementById('RadioButtonChrome');
      if (radChrome) radChrome.checked = true;
      const lblSetChrome = document.getElementById('lblSettingChrome');
      if (lblSetChrome) {
        lblSetChrome.style.color = '#38bdf8';
        lblSetChrome.style.background = '#0b1324';
        lblSetChrome.style.boxShadow = '0 1px 2px rgba(0,0,0,0.4)';
      }

      // Update Dashboard badge
      const badge = document.getElementById('dashBrowserBadge');
      if (badge) {
        badge.style.background = 'rgba(14, 165, 233, 0.15)';
        badge.style.borderColor = 'rgba(14, 165, 233, 0.35)';
        badge.style.color = '#38bdf8';
        badge.textContent = '🌐 Google Chrome (Mặc định - Chrome 150 - 156)';
      }

      // Persist to localStorage
      try {
        localStorage.setItem('autoleadpc_browser_choice', 'Chrome');
      } catch { }

      if (shouldSave) {
        void saveWindowsSettings();
      }
    }
