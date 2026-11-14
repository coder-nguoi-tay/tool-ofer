/**
     * Lưu cấu hình trình duyệt và token GoLogin riêng; ô token trống giữ cấu hình cũ.
     * @return {Promise<void>} Hoàn tất lưu cài đặt và xóa token vừa nhập khỏi ô hiển thị.
     * @throws {Error} Khi máy chủ cục bộ từ chối lưu cấu hình.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function saveWindowsSettings() {
      const tokenInput = document.getElementById('gologinApiToken');
      const newGoLoginToken = tokenInput?.value.trim() || '';
      const payload = {
        gologinDevices: typeof getGoLoginDeviceChoices === 'function' ? getGoLoginDeviceChoices() : undefined,
        ...(newGoLoginToken ? { gologinToken: newGoLoginToken } : {}),
        browserMode: 'Chrome',
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
      if (newGoLoginToken) {
        tokenInput.value = '';
        tokenInput.placeholder = 'Đã lưu token — nhập để thay đổi';
        const tokenStatus = document.getElementById('gologinTokenStatus');
        if (tokenStatus) tokenStatus.textContent = 'Đã cấu hình token GoLogin. Để trống để giữ token hiện tại.';
      }
      const statusEl = document.getElementById('settingsSaveStatus');
      if (statusEl) {
        statusEl.textContent = 'Đã lưu cài đặt.';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
      }
    }
