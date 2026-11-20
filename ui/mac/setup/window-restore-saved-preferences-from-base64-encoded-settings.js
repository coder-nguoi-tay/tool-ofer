/** @var {number} Hard finite Mac UI bound; the server applies its configured live-browser cap. */
const MAC_REQUESTED_COUNT_CAP = 256;

/**
      * Normalize a saved Mac count without converting a decimal string through Number.
      * @param {string|number} value Saved or currently entered count.
      * @return {string} Canonical positive decimal count bounded by the Mac UI cap.
      * @throws {never} Invalid values use the existing Mac default of 6.
      * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
      * @since 2026-11-20
      */
    function normalizeMacRequestedCount(value) {
      const raw = String(value ?? '').trim();
      if (!/^\d+$/.test(raw)) return '6';
      const digits = raw.replace(/^0+(?=\d)/, '');
      if (digits === '0') return '6';
      const maximum = String(MAC_REQUESTED_COUNT_CAP);
      return digits.length > maximum.length || digits.length === maximum.length && digits > maximum
        ? '6'
        : digits;
    }

    /**
     * Khôi phục cấu hình số cửa sổ đã lưu.
     * @param {string} encodedSettings Cấu hình UTF-8 mã hóa Base64 từ Keychain.
      * @return {void} Cập nhật các trường trong giao diện.
      * @throws {Error} Khi dữ liệu Base64 hoặc JSON đã lưu không hợp lệ.
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
      countField.value = normalizeMacRequestedCount(countField.value);
      saveStatus.textContent = Object.keys(preferences).length ? 'Đã tải cấu hình đã lưu.' : 'Chưa có cấu hình đã lưu.';
    };
