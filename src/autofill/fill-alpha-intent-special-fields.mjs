import { humanClick } from './human-click.mjs';
import { tryFastTextInput } from './interaction/try-fast-text-input.mjs';
import { syncAlphaHiddenFullName } from './alpha-intent/sync-alpha-hidden-full-name.mjs';
import { syncAlphaHiddenGender } from './alpha-intent/sync-alpha-hidden-gender.mjs';
import { syncAlphaTcpaConsent } from './alpha-intent/sync-alpha-tcpa-consent.mjs';
import { syncAlphaContactLocation } from './alpha-intent/sync-alpha-contact-location.mjs';
import { syncAlphaHiddenContactData } from './alpha-intent/sync-alpha-hidden-contact-data.mjs';
import { locateFormElements } from './form-scope/locate-form-elements.mjs';
import { fillAlphaIntentFullName } from './fill-alpha-intent-full-name.mjs';
import { getNormalizedPhone } from './get-normalized-phone.mjs';
import { selectFirstAddressSuggestion } from './select-first-address-suggestion.mjs';

/**
 * Điền và đồng bộ toàn diện các trường đặc thù của Alpha Intent:
 * - Họ tên (đồng bộ #input-fullname data-hidden-required)
 * - Giới tính (radio & đồng bộ #input-gender data-hidden-required)
 * - TCPA / Disclaimer Checkbox (đồng bộ #has_tcpa_optin)
 * - Đồng bộ các trường ẩn required khác (#input-address, #input-dob, #input-phone)
 * - Nút lưu số điện thoại TCPA (button.button-save-phone)
 * Bỏ qua ô khóa; giới hạn chờ thao tác và chỉ đánh dấu sau khi website giữ giá trị.
 *
 * @param {object} frame Frame chứa form Alpha Intent.
 * @param {object} record Bản ghi người dùng.
 * @return {Promise<number>} Số trường/hành động đã hoàn thành trong pass này.
 * @throws {never} Lỗi xử lý an toàn không gián đoạn luồng chính.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function fillAlphaIntentSpecialFields(frame, record = {}) {
  let filledCount = 0;
  if (!frame || typeof frame.evaluate !== 'function') return filledCount;
  const page = typeof frame.page === 'function' ? frame.page() : frame;
  try {
    // 1. Họ tên Alpha Intent qua locator chuẩn
    let nameFilled = await fillAlphaIntentFullName(frame, record);
    if (nameFilled) {
      filledCount += 1;
    } else {
      // 1.1 Mở rộng họ tên cho container #ai-funnel (LaunchPotato / SweepstakesAlerts)
      const fallbackNameField = locateFormElements(frame, '#ai-funnel input[data-testid="fullname-input"], #ai-funnel .ai-input-container-fullname input#name, #ai-funnel input#name, #ai-funnel input[name="name"], #ai-funnel input[name="fullName"], #ai-funnel input[name="full_name"], #alpha-intent-content input#name, #alpha-intent-content input[name="name"], input[data-testid="fullname-input"], input[data-testid="name-input"], .alpha-intent-content input#name').first();
      if ((await fallbackNameField.count().catch(() => 0)) > 0 && (await fallbackNameField.isVisible().catch(() => false)) && (await fallbackNameField.isEditable({ timeout: 1000 }).catch(() => false))) {
        const curVal = (await fallbackNameField.inputValue({ timeout: 1000 }).catch(() => '')).trim();
        const combinedName = [record.firstname, record.lastname].filter(Boolean).join(' ').trim() || record.fullname || (record.email ? record.email.split('@')[0] : 'James Smith');
        if (combinedName && curVal !== combinedName) {
          if (await tryFastTextInput(fallbackNameField, combinedName, page)) {
            await fallbackNameField.evaluate(el => {
              el.dataset.uxFilled = '1';
            }, undefined, { timeout: 1000 }).catch(() => {});
            filledCount += 1;
            await frame.evaluate(syncAlphaHiddenFullName, frame._activeAutofillFormScope ? { __formScopePayload: true, value: combinedName, scopeSelector: frame._activeAutofillFormScope.memberSelector } : combinedName).catch(() => {});
          }
        }
      }
    }

    // 2. Giới tính Alpha Intent & đồng bộ #input-gender (data-hidden-required="true")
    const genderVal = /female|f|nữ/i.test(record.gender || '') ? 'FEMALE' : 'MALE';
    const genderLoc = locateFormElements(frame, `input[type="radio"].ai-input-gender[value="${genderVal}" i], input#ai-${genderVal.toLowerCase()}-input, .ai-gender-button[data-gender="${genderVal}" i], [data-testid="gender-${genderVal.toLowerCase()}"], #ai-funnel [data-gender="${genderVal}"], #ai-funnel button[data-gender="${genderVal}"]`).first();
    if ((await genderLoc.count().catch(() => 0)) > 0 && (await genderLoc.isEnabled({ timeout: 1000 }).catch(() => false))) {
      const isChecked = await genderLoc.isChecked({ timeout: 1000 }).catch(() => false);
      const selected = isChecked || (!page?.mouse || await humanClick(page, genderLoc)) && await genderLoc.check({ force: true, timeout: 1500 }).then(() => true).catch(() => false);
      if (selected) {
        if (!isChecked) filledCount += 1;
        await frame.evaluate(syncAlphaHiddenGender, frame._activeAutofillFormScope ? { __formScopePayload: true, value: genderVal, scopeSelector: frame._activeAutofillFormScope.memberSelector } : genderVal).catch(() => {});
      }
    }

    // 3. TCPA Disclaimer Checkbox (#ai-disclaimer-container) & đồng bộ #has_tcpa_optin
    const disclaimerCb = locateFormElements(frame, '#ai-disclaimer-container input[type="checkbox"], label.tcpa-text input[type="checkbox"], .ai-tcpa input[type="checkbox"], [data-testid="tcpa-checkbox"], #ai-funnel input[type="checkbox"][name*="consent"], #ai-funnel input[type="checkbox"][name*="tcpa"]').first();
    if ((await disclaimerCb.count().catch(() => 0)) > 0 && (await disclaimerCb.isEnabled({ timeout: 1000 }).catch(() => false))) {
      const isChecked = await disclaimerCb.isChecked({ timeout: 1000 }).catch(() => false);
      const selected = isChecked || (!page?.mouse || await humanClick(page, disclaimerCb)) && await disclaimerCb.check({ force: true, timeout: 1500 }).then(() => true).catch(() => false);
      if (selected) {
        if (!isChecked) filledCount += 1;
        await frame.evaluate(syncAlphaTcpaConsent, frame._activeAutofillFormScope ? { __formScopePayload: true, scopeSelector: frame._activeAutofillFormScope.memberSelector } : null).catch(() => {});
      }
    }

    // 4.1 Điền và đồng bộ ô Địa chỉ Alpha Intent (#address, input[data-testid="address-input"])
    const addrField = locateFormElements(frame, '#address, input[data-testid="address-input"], #ai-funnel input#address, #ai-funnel input[name="address"], #alpha-intent-content input#address, input[name="address1"]').first();
    if ((await addrField.count().catch(() => 0)) > 0 && (await addrField.isVisible().catch(() => false)) && (await addrField.isEditable({ timeout: 1000 }).catch(() => false))) {
      const curAddr = (await addrField.inputValue({ timeout: 1000 }).catch(() => '')).trim();
      const targetAddr = record.address || '4125 N Inspiration Loop';
      if (!curAddr || curAddr.length < 3) {
        if (await tryFastTextInput(addrField, targetAddr, page)) {
          await addrField.evaluate(el => {
            el.dispatchEvent(new Event('input', {
              bubbles: true
            }));
            el.dispatchEvent(new KeyboardEvent('keydown', {
              key: 'ArrowDown',
              bubbles: true
            }));
          }, undefined, { timeout: 1000 }).catch(() => {});

          // Đợi API gợi ý SmartyStreets / debounce (tối đa 400ms)
          await new Promise(r => setTimeout(r, 450));
          const picked = await selectFirstAddressSuggestion(frame.page ? frame.page() : frame, frame, addrField);
          if (!picked) {
            const downSteps = Math.random() < 0.5 ? 1 : 2;
            for (let d = 0; d < downSteps; d++) {
              await addrField.press('ArrowDown', { timeout: 500 }).catch(() => {});
            }
            await addrField.press('Enter', { timeout: 500 }).catch(() => {});
          }
          await addrField.evaluate(el => {
            el.dataset.uxFilled = '1';
          }, undefined, { timeout: 1000 }).catch(() => {});
          filledCount += 1;
        }
      }

      // Luôn đồng bộ trường ẩn #input-address và các thuộc tính data của AlphaIntent
      await frame.evaluate(syncAlphaContactLocation, frame._activeAutofillFormScope ? { __formScopePayload: true, value: record, scopeSelector: frame._activeAutofillFormScope.memberSelector } : record).catch(() => {});
    }

    // 4.2 Điền và đồng bộ ô Ngày sinh Alpha Intent (#date, input[data-testid="dob-input"])
    const dobField = locateFormElements(frame, '#date, input[data-testid="dob-input"], #ai-funnel input#date, input[name="date"]').first();
    if ((await dobField.count().catch(() => 0)) > 0 && (await dobField.isVisible().catch(() => false)) && (await dobField.isEditable({ timeout: 1000 }).catch(() => false))) {
      const curDob = (await dobField.inputValue({ timeout: 1000 }).catch(() => '')).trim();
      if (!curDob || curDob.includes('_') || curDob.length < 8) {
        let formattedDob = '05/18/1992';
        if (record.dob && /^\d{4}-\d{2}-\d{2}$/.test(record.dob)) {
          const [y, m, d] = record.dob.split('-');
          formattedDob = `${m}/${d}/${y}`;
        } else if (record.dob && /^\d{2}\/\d{2}\/\d{4}$/.test(record.dob)) {
          formattedDob = record.dob;
        }
        if (await tryFastTextInput(dobField, formattedDob, page)) {
          await dobField.evaluate(el => {
            el.dataset.uxFilled = '1';
          }, undefined, { timeout: 1000 }).catch(() => {});
          filledCount += 1;
        }
      }
    }

    // 4.3 Điền và đồng bộ ô Số điện thoại Alpha Intent (#phone, input[data-testid="phone-input"])
    const phoneField = locateFormElements(frame, '#phone, input[data-testid="phone-input"], #ai-funnel input#phone, #ai-funnel input[name="phone"], #alpha-intent-content input#phone, input[name="phoneNumber"], input[type="tel"]:not([name*="zip" i]):not([id*="zip" i]):not([name*="postal" i]):not([id*="postal" i]):not([name="age"]):not([id="age"]):not([id$="-age"])').first();
    // Ô tel của zip/age bị loại: trước đây `.first()` trúng ô Zip đầu tiên và gõ SĐT vào đó.
    if ((await phoneField.count().catch(() => 0)) > 0 && (await phoneField.isVisible().catch(() => false)) && (await phoneField.isEditable({ timeout: 1000 }).catch(() => false))) {
      const curPhone = (await phoneField.inputValue({ timeout: 1000 }).catch(() => '')).replace(/\D/g, '');
      if (curPhone.length < 10) {
        const rawPhone = getNormalizedPhone(record);
        const area = rawPhone.slice(0, 3);
        const mid = rawPhone.slice(3, 6);
        const last = rawPhone.slice(6, 10);
        const formatted = `(${area}) ${mid}-${last}`;
        if (await tryFastTextInput(phoneField, formatted, page)) {
          await phoneField.evaluate(el => {
            el.dataset.uxFilled = '1';
          }, undefined, { timeout: 1000 }).catch(() => {});
          filledCount += 1;
        }
      }
    }

    // 4.4 Điền ô Thành phố & Zipcode Alpha Intent nếu có trên form
    const cityField = locateFormElements(frame, '#city, input[data-testid="city-input"], #ai-funnel input#city, #ai-funnel input[name="city"], #alpha-intent-content input#city').first();
    if ((await cityField.count().catch(() => 0)) > 0 && (await cityField.isVisible().catch(() => false)) && (await cityField.isEditable({ timeout: 1000 }).catch(() => false))) {
      const curCity = (await cityField.inputValue({ timeout: 1000 }).catch(() => '')).trim();
      const targetCity = record.city || record.town || 'Clifton';
      if (!curCity || curCity.length < 2) {
        if (await tryFastTextInput(cityField, targetCity, page)) {
          await cityField.evaluate(el => {
            el.dataset.uxFilled = '1';
          }, undefined, { timeout: 1000 }).catch(() => {});
          filledCount += 1;
        }
      }
    }
    const zipField = locateFormElements(frame, '#zipcode, input[data-testid="zipcode-input"], #ai-funnel input#zipcode, #ai-funnel input[name="zipCode"], #ai-funnel input[name="zipcode"]').first();
    if ((await zipField.count().catch(() => 0)) > 0 && (await zipField.isVisible().catch(() => false)) && (await zipField.isEditable({ timeout: 1000 }).catch(() => false))) {
      const curZip = (await zipField.inputValue({ timeout: 1000 }).catch(() => '')).replace(/\D/g, '');
      const targetZip = String(record.zipcode || record.zip || '07055').replace(/\D/g, '').slice(0, 5);
      if (curZip.length !== 5 && targetZip.length === 5) {
        if (await tryFastTextInput(zipField, targetZip, page)) {
          await zipField.evaluate(el => {
            el.dataset.uxFilled = '1';
          }, undefined, { timeout: 1000 }).catch(() => {});
          filledCount += 1;
        }
      }
    }

    // 4.5 Đồng bộ các ô ẩn required khác (#input-address, #input-dob, #input-phone, #input-fullname) nếu ô hiển thị đã có giá trị
    await frame.evaluate(syncAlphaHiddenContactData, frame._activeAutofillFormScope ? { __formScopePayload: true, scopeSelector: frame._activeAutofillFormScope.memberSelector } : null).catch(() => {});

    // 5. Nút lưu số điện thoại phụ trong TCPA nếu xuất hiện (button.button-save-phone)
    const savePhoneBtn = locateFormElements(frame, 'button.button-save-phone:not([data-ux-clicked="1"]), .hidden-tcpa-input button:not([data-ux-clicked="1"])').first();
    if ((await savePhoneBtn.count().catch(() => 0)) > 0 && (await savePhoneBtn.isVisible().catch(() => false))) {
      const telInput = locateFormElements(frame, '.hidden-tcpa-input input[type="tel"]').first();
      if ((await telInput.count().catch(() => 0)) > 0) {
        const rawPhone = getNormalizedPhone(record);
        const area = rawPhone.slice(0, 3);
        const mid = rawPhone.slice(3, 6);
        const last = rawPhone.slice(6, 10);
        const formatted = `(${area}) ${mid}-${last}`;
        if (!await tryFastTextInput(telInput, formatted, page)) return filledCount;
      }
      const clicked = await humanClick(page, savePhoneBtn);
      if (clicked) {
        await savePhoneBtn.evaluate(b => b.setAttribute('data-ux-clicked', '1'), undefined, { timeout: 1000 }).catch(() => {});
        filledCount += 1;
      }
    }
  } catch {}
  return filledCount;
}
export { fillAlphaIntentSpecialFields };
