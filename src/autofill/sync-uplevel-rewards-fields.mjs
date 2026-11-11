import { fillUplevelVisibleFields } from './uplevel/fill-visible-fields.mjs';

/**
 * Điền và đồng bộ toàn diện các trường đặc thù của Uplevel Rewards (#reg-container):
 * - Định dạng số điện thoại 14 ký tự vào #tl (telephone_two)
 * - Đồng bộ 10 số thô vào input ẩn telephone, phonecode, phoneprefix, phonesuffix
 * - Nút giới tính (.gbtn, btnselected) và input#genderid
 * - Kích hoạt class .active trên nút tiếp tục #sub-btn
 *
 * @param {object} frame Frame hoặc Page của Playwright.
 * @param {object} record Dữ liệu người dùng.
 * @return {Promise<number>} Số trường/hành động đã hoàn thành trong pass này.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
async function syncUplevelRewardsFields(frame, record = {}) {
  let filledCount = 0;
  if (!frame || typeof frame.evaluate !== 'function') return filledCount;
  try {
    filledCount += await fillUplevelVisibleFields(frame, record);
    const synced = await frame.evaluate(({ record: rec, scopeSelector }) => {
      const regContainer = document.querySelector('#reg-container, #global-reg, #cid-global');
      if (!regContainer) return 0;
      /**
       * Tìm control đặc thù trong đúng form, kể cả control liên kết bên ngoài.
       * @param {string} selector Selector control cần đồng bộ.
       * @return {Element|undefined} Control thuộc phạm vi hiện tại.
       * @author ductv <ductv@getflycrm.com>
       * @since 2026-11-10
       */
      const findControl = selector => Array.from(document.querySelectorAll(selector)).find(element => !scopeSelector || element.matches(scopeSelector));
      let actionsCount = 0;
      const triggerFieldEvents = el => {
        if (!el) return;
        el.dispatchEvent(new Event('input', {
          bubbles: true
        }));
        el.dispatchEvent(new Event('change', {
          bubbles: true
        }));
        el.dispatchEvent(new Event('blur', {
          bubbles: true
        }));
        el.dispatchEvent(new KeyboardEvent('keyup', {
          bubbles: true
        }));
        if (window.jQuery) {
          try {
            window.jQuery(el).trigger('input').trigger('change').trigger('keyup').trigger('blur');
          } catch {}
        }
      };

      // Ô hiển thị đã điền tuần tự bằng chuột; phần này chỉ đồng bộ payload điện thoại ẩn.
      const rawDigits = String(rec.phone || rec.phonenumber || rec.cellphone || '').replace(/\D/g, '');
      const valid10 = rawDigits.length >= 10 ? rawDigits.slice(-10) : '8145551234';

      // Luôn đồng bộ 4 hidden input mà trang web dùng để gửi lead và validate
      const telHidden = findControl('input[name="telephone"]');
      if (telHidden && telHidden.value !== valid10) {
        telHidden.value = valid10;
        triggerFieldEvents(telHidden);
      }
      const codeHidden = findControl('input[name="phonecode"]');
      if (codeHidden && codeHidden.value !== valid10.slice(0, 3)) {
        codeHidden.value = valid10.slice(0, 3);
      }
      const prefixHidden = findControl('input[name="phoneprefix"]');
      if (prefixHidden && prefixHidden.value !== valid10.slice(3, 6)) {
        prefixHidden.value = valid10.slice(3, 6);
      }
      const suffixHidden = findControl('input[name="phonesuffix"]');
      if (suffixHidden && suffixHidden.value !== valid10.slice(6, 10)) {
        suffixHidden.value = valid10.slice(6, 10);
      }

      // 2. Đồng bộ Giới tính (Gender Buttons: #male, #female, .gbtn)
      const genderRaw = String(rec.gender || rec.gioitinh || rec.sex || '').trim().toLowerCase();
      const isFemale = /^(female|f|nu|woman|girl|mrs|ms|miss)$/i.test(genderRaw);
      const targetCode = isFemale ? 'F' : 'M';
      const maleBtn = findControl('#male, .male.gbtn, [data-gender="M"]');
      const femaleBtn = findControl('#female, .female.gbtn, [data-gender="F"]');
      const targetBtn = isFemale ? femaleBtn || maleBtn : maleBtn || femaleBtn;
      const otherBtn = isFemale ? maleBtn : femaleBtn;
      if (targetBtn) {
        if (!targetBtn.classList.contains('btnselected')) {
          targetBtn.classList.add('btnselected', 'selected', 'active');
          if (otherBtn) otherBtn.classList.remove('btnselected', 'selected', 'active');
          try {
            targetBtn.click();
          } catch {}
          actionsCount++;
        }
      }
      const genderInput = findControl('input#genderid, input[name="genderid"], input[name="gender"]');
      if (genderInput && genderInput.value !== targetCode) {
        genderInput.value = targetCode;
        genderInput.dataset.uxFilled = '1';
        triggerFieldEvents(genderInput);
        actionsCount++;
      }

      // Xóa class invalid và thêm valid non-empty trên toàn bộ field-item đã có dữ liệu hợp lệ
      Array.from(document.querySelectorAll('#reg-container .field-item, #global-reg .field-item')).filter(element => !scopeSelector || element.matches(scopeSelector)).forEach(item => {
        const inp = item.querySelector('input, select');
        if (inp && inp.value && String(inp.value).trim().length > 0) {
          item.classList.remove('invalid');
          item.classList.add('valid', 'non-empty');
          const err = item.querySelector('.error-entry');
          if (err) err.style.display = 'none';
        }
      });

      // 3. Kích hoạt validator và bật sáng nút Continue (#sub-btn)
      if (window.LMReg && typeof window.LMReg.validateReg2 === 'function') {
        try {
          window.LMReg.validateReg2();
        } catch {}
      }
      const subBtn = findControl('#sub-btn');
      if (subBtn && !subBtn.classList.contains('active')) {
        const hasEm = Boolean(findControl('#em')?.value);
        const hasFn = Boolean(findControl('#fn')?.value);
        const hasLn = Boolean(findControl('#ln')?.value);
        const hasAd = Boolean(findControl('#ad')?.value);
        const hasZp = Boolean(findControl('#zp')?.value);
        const hasCt = Boolean(findControl('#ct')?.value);
        const hasSt = Boolean(findControl('#state')?.value);
        const hasTl = Boolean(findControl('#tl')?.value);
        if (hasEm && hasFn && hasLn && hasAd && hasZp && hasCt && hasSt && hasTl) {
          subBtn.classList.add('active');
        }
      }
      return actionsCount;
    }, { record, scopeSelector: frame._activeAutofillFormScope?.memberSelector }).catch(() => 0);
    filledCount += synced;
  } catch {}
  return filledCount;
}
export { syncUplevelRewardsFields };
