/**
 * Open select picker.
 * @param {*} options options.
 * @param {number} selectedIndex selected index.
 * @return {void} Kết quả xử lý open select picker.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function openSelectPicker(options, selectedIndex) {
      selectModalOptions.innerHTML = options.map((opt, idx) => `
        <div class="select-opt-item ${idx === selectedIndex ? 'selected' : ''}" onclick="selectPickerOption(${idx})">
          <span>${opt.label || opt.text || opt.value || `Mục ${idx + 1}`}</span>
          ${idx === selectedIndex ? '<span>✓</span>' : ''}
        </div>
      `).join('');
      selectModal.style.display = 'flex';
      try { tg?.HapticFeedback?.impactOccurred('medium'); } catch (e) {}
    }
