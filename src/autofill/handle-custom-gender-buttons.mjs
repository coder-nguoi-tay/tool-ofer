/**
 * Tự động chọn giới tính trên các form có custom buttons (như Uplevel Rewards #gender, .gbtn).
 * Đồng bộ giá trị vào input ẩn và xóa class invalid/error trên form container.
 *
 * @param {object} frame Frame hoặc Page của Playwright.
 * @param {object} record Dữ liệu người dùng.
 * @return {Promise<number>} Số lựa chọn giới tính đã thực hiện (0 hoặc 1).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function handleCustomGenderButtons(frame, record = {}) {
  try {
    const genderRaw = String(record.gender || record.gioitinh || record.sex || '').trim().toLowerCase();
    const isFemale = /^(female|f|nu|woman|girl|mrs|ms|miss)$/i.test(genderRaw);
    const targetCode = isFemale ? 'F' : 'M';
    const selected = await frame.evaluate(({
      targetCode,
      isFemale,
      scopeSelector
    }) => {
      /**
       * Tìm control đặc thù trong đúng form, kể cả control liên kết bên ngoài.
       * @param {string} selector Selector control cần đồng bộ.
       * @return {Element|undefined} Control thuộc phạm vi hiện tại.
       * @author ductv <ductv@getflycrm.com>
       * @since 2026-11-10
       */
      // Chỉ nhận control đang hiển thị: #gender có thể là một bước funnel đang ẩn (selectmypolicy).
      const shown = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
      const findControl = selector => Array.from(document.querySelectorAll(selector)).find(element => (!scopeSelector || element.matches(scopeSelector)) && (element.tagName === 'INPUT' || shown(element)));
      // 1. Tìm container gender hoặc nút gender
      const genderContainer = findControl('#gender, [data-tag="gender"], .gender-group, .gender-wrapper, [data-field="gender"]');
      const maleBtn = findControl('#male, .male.gbtn, [data-gender="M"], [data-gender="male"]');
      const femaleBtn = findControl('#female, .female.gbtn, [data-gender="F"], [data-gender="female"]');
      if (!maleBtn && !femaleBtn && !genderContainer) return 0;
      const targetBtn = isFemale ? femaleBtn || maleBtn : maleBtn || femaleBtn;
      const genderInput = findControl('input#genderid, input[name="genderid"], input[name="gender"], input#gender');
      // Không có nút hay input nào để thao tác: không được báo "đã chọn" (trước đây trả 1 mỗi lượt quét,
      // bị tính là tiến triển nên watcher không bao giờ phát hiện form đang kẹt).
      if (!targetBtn && !genderInput) return 0;

      // Kiểm tra nếu đã được chọn đúng và không bị báo lỗi thì bỏ qua
      const isAlreadySelected = targetBtn && (targetBtn.classList.contains('selected') || targetBtn.classList.contains('active') || targetBtn.dataset.uxClicked === '1') || genderInput && genderInput.value && !genderInput.classList.contains('invalid');
      const parentItem = (targetBtn || genderContainer)?.closest('.field-item, .form-group, .field');
      const isItemInvalid = parentItem && parentItem.classList.contains('invalid');
      if (isAlreadySelected && !isItemInvalid) return 0;

      // Click nút tương ứng
      if (targetBtn) {
        targetBtn.dataset.uxClicked = '1';
        targetBtn.click();
        targetBtn.classList.add('selected', 'active');
      }

      // Cập nhật giá trị input gender ngầm
      if (genderInput) {
        genderInput.value = targetCode;
        genderInput.dataset.uxFilled = '1';
        genderInput.classList.remove('invalid', 'error');
        genderInput.classList.add('valid', 'has-value');
        genderInput.dispatchEvent(new Event('input', {
          bubbles: true
        }));
        genderInput.dispatchEvent(new Event('change', {
          bubbles: true
        }));
      }

      // Xóa trạng thái lỗi trên container cha
      if (parentItem) {
        parentItem.classList.remove('invalid', 'error');
        parentItem.classList.add('valid', 'non-empty');
        const err = parentItem.querySelector('.error-entry, .error');
        if (err) err.style.display = 'none';
      }
      return 1;
    }, {
      targetCode,
      isFemale,
      scopeSelector: frame._activeAutofillFormScope?.memberSelector
    });
    return selected || 0;
  } catch {
    return 0;
  }
}
export { handleCustomGenderButtons };
