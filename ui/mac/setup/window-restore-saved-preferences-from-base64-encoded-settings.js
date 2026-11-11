/**
     * Khôi phục cấu hình đã lưu và chặn số cửa sổ cũ vượt giới hạn hiện tại.
     * @param {string} encodedSettings Cấu hình UTF-8 mã hóa Base64 từ Keychain.
     * @return {void} Cập nhật các trường trong giao diện.
     * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
     * @since 2026-10-15
     */
    window.restoreSavedPreferencesFromBase64 = (encodedSettings) => {
      const bytes = Uint8Array.from(atob(encodedSettings), (character) => character.charCodeAt(0));
      const preferences = JSON.parse(new TextDecoder().decode(bytes));
      // Hai ô lead check luôn khởi động ở trạng thái KHÔNG tích (bỏ qua giá trị lưu cũ).
      const notRestoredFieldNames = ['enableLeadCheck', 'autoCloseNoLead'];
      for (const fieldName of savedFieldNames) {
        if (notRestoredFieldNames.includes(fieldName)) continue;
        const field = form.elements.namedItem(fieldName);
        if (field && preferences[fieldName] !== undefined) {
          if (field.type === 'checkbox') {
            field.checked = preferences[fieldName] === '1' || preferences[fieldName] === true || preferences[fieldName] === 'on';
          } else {
            field.value = preferences[fieldName];
          }
        }
      }
      const countField = form.elements.namedItem('requestedCount');
      countField.value = String(Math.min(6, Math.max(1, Math.floor(Number(countField.value) || 6))));
      saveStatus.textContent = Object.keys(preferences).length ? 'Đã tải cấu hình đã lưu.' : 'Chưa có cấu hình đã lưu.';
    };
