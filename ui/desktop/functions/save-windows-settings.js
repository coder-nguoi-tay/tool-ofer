/**
     * Lưu chế độ trình duyệt Google Chrome và tùy chọn fingerprint của AutoLeadPC.
     * @return {Promise<void>} Hoàn tất ghi Settings.ini.
     * @throws {Error} Khi máy chủ cục bộ từ chối lưu cấu hình.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function saveWindowsSettings() {
      const payload = {
        browserMode: 'Chrome',
        CloakBrowser: document.getElementById('chkUseCloakBrowser')?.checked ?? document.getElementById('cbxCloakBrowser')?.checked ?? false,
        Canvas: document.getElementById('CheckBoxCanvas')?.checked ?? false,
        ClientRects: document.getElementById('CheckboxClientRects')?.checked ?? true,
        WebGLImage: document.getElementById('CheckBoxWebGLImage')?.checked ?? true,
        Fonts: document.getElementById('CheckboxFonts')?.checked ?? true,
        WebRTC: document.getElementById('CheckBoxWebRTC')?.checked ?? true,
        ApiFakeIP: document.getElementById('CheckBoxGetApiPake')?.checked ?? true,
        Windows: document.getElementById('chkWindows')?.checked ?? true,
        Mac: document.getElementById('chkMac')?.checked ?? false,
        Linux: document.getElementById('chkLinux')?.checked ?? false,
        Android: document.getElementById('chkAndroid')?.checked ?? false,
        iPhone: document.getElementById('chkIphone')?.checked ?? false,
        iPad: document.getElementById('chkIpad')?.checked ?? false,
      };
      const result = await api('/pc/settings/save', { method: 'POST', body: JSON.stringify(payload) });
      if (result?.error) throw new Error(result.error);
      const statusEl = document.getElementById('settingsSaveStatus');
      if (statusEl) {
        statusEl.textContent = 'Saved to Settings.ini successfully!';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
      }
    }
