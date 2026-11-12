import { reportSelectMismatch } from './report-select-mismatch.mjs';
import { buildSelectCandidates } from './select/build-select-candidates.mjs';
import { selectOptionWithHumanInteraction } from './select/select-option-with-human-interaction.mjs';
import { scrollToFormControl } from './form-scope/scroll-to-form-control.mjs';
import { addVerifiedFieldCount } from './add-verified-field-count.mjs';
import { handleAddressSelectDropdown } from './handle-address-select-dropdown.mjs';
import { hasActiveAddressSuggestions } from './has-active-address-suggestions.mjs';
import { humanClick } from './human-click.mjs';
import { humanType } from './human-type.mjs';
import { parseDobComponents } from './parse-dob-components.mjs';
import { selectFirstAddressSuggestion } from './select-first-address-suggestion.mjs';

/**
 * Điền giá trị vào select hoặc ô nhập và xử lý chọn địa chỉ gợi ý.
 * @param {object} context Trường hoặc frame đang xử lý cùng dữ liệu và tiến độ của lượt quét.
 * @return {Promise<boolean>} True khi cần bỏ qua trường hiện tại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function fillSelectOrTextField({
  metadata,
  field,
  page,
  valueToFill,
  options,
  session,
  frameProgress,
  unmatchedFieldNames,
  frame,
  record
}) {
  if (metadata.kind === 'select') {
    const candidates = buildSelectCandidates(valueToFill, metadata);
    const result = await selectOptionWithHumanInteraction({ page, field, candidates }).catch(() => ({ matched: false, verified: false, reason: 'select_unavailable' }));
    // navigated: trang đã chuyển ngay khi chọn — không coi là ô chưa khớp.
    if (!result.verified && result.reason !== 'navigated') {
      const identity = metadata.id || metadata.name || metadata.names?.[0] || 'select';
      unmatchedFieldNames?.add(identity);
      reportSelectMismatch(frame || page, metadata, candidates, result, options, page);
    }
    return result;
  } else if (metadata.type === 'date') {
    if (page?.mouse && !await humanClick(page, field)) return true;
    // <input type="date"> KHÔNG gõ từng ký tự được (keyboard gõ ISO sẽ bị
    // segment theo locale nuốt sai thứ tự MM/DD/YYYY). Phải set chuỗi ISO
    // trực tiếp qua fill() hoặc native value setter rồi bắn sự kiện.
    const isoDate = (() => {
      const raw = String(valueToFill).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      const parsed = parseDobComponents(raw);
      return parsed?.isoDob || raw;
    })(); // matchFieldValue đã ưu tiên trả ISO khi metadata.type === 'date'
    options.onLog?.({
      type: 'date_fill_attempt',
      field: metadata.names?.[0] || metadata.id || 'date',
      detail: `[DateFill] Thử điền ô ngày ${metadata.id || metadata.name} với ${isoDate}`
    });
    try {
      await field.fill(isoDate, {
        force: true,
        timeout: 2000
      });
    } catch {}
    // Xác minh: nếu fill không ăn (validator trang xóa), set bằng native setter
    const dateVal = await field.inputValue().catch(() => '');
    if (dateVal.trim() !== isoDate) {
      await field.evaluate((el, val) => {
        const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc?.set) desc.set.call(el, val);else el.value = val;
        el.dispatchEvent(new Event('input', {
          bubbles: true
        }));
        el.dispatchEvent(new Event('change', {
          bubbles: true
        }));
        el.dispatchEvent(new Event('blur', {
          bubbles: true
        }));
      }, isoDate).catch(() => {});
    }
    // Xác minh lần cuối trước khi đánh dấu đã điền
    const finalDateVal = await field.inputValue().catch(() => '');
    if (finalDateVal && finalDateVal.trim() === isoDate) {
      options.onLog?.({
        type: 'field_filled',
        tag: 'INPUT',
        id: metadata.id || null,
        name: metadata.name || null,
        text: metadata.names?.[0] || 'date',
        detail: `Đã điền ô ngày [${metadata.id || metadata.name}]: ${finalDateVal}`
      }, page);
      await field.evaluate(el => {
        el.dataset.uxFilled = '1';
        el.classList.remove('invalid', 'error');
        el.classList.add('valid', 'has-value');
        const parent = el.closest('.field-item, .form-group, .input-group, .loco-group');
        if (parent) {
          parent.classList.remove('invalid', 'error');
          parent.classList.add('valid', 'non-empty');
          const err = parent.querySelector('.error-entry, .error');
          if (err) err.style.display = 'none';
        }
        el.dispatchEvent(new Event('change', {
          bubbles: true
        }));
        el.dispatchEvent(new Event('blur', {
          bubbles: true
        }));
      }).catch(() => {});
      addVerifiedFieldCount(session, 1);
      frameProgress.filledInThisPass += 1;
      session.lastActionTime = Date.now();
      return true;
    }
    // Không điền được date — không đánh dấu, vòng quét sau thử lại
    options.onLog?.({
      type: 'date_fill_failed',
      field: metadata.names?.[0] || metadata.id || 'date',
      detail: `[DateFill] KHÔNG điền được ô ngày ${metadata.id || metadata.name}. Giá trị copy hiện tại: "${finalDateVal ?? ''}" (mong đợi "${isoDate}")`
    });
    unmatchedFieldNames.add(`${metadata.names?.[0] ?? 'date'} (date fill failed)`);
    return true;
  } else {
    // Nhập từ từ mô phỏng nhịp gõ phím của người thật (chống bị phát hiện bot autofill)
    await humanType(field, valueToFill, page);

    // XÁC MINH SAU GÕ (fix): framework có thể clear ô (type=tel + maxlength,
    // React/Angular reset) — trước đây chỉ set data-ux-filled="1" nên ô rỗng vẫn bị coi
    // là đã điền và Submit được bấm với ô trống ("Zip code must be 5 digits",
    // "Email address invalid" trên form defaultform/My Resource Helper).
    // Nếu giá trị không còn khớp: gõ lại tối đa 2 lần; lần cuối dùng fill() khẩn.
    {
      let expectVal = String(valueToFill);
      // Ô số điện thoại/zip: chỉ giữ chữ số, đúng maxlength nếu trang giới hạn
      if (String(metadata.type || '').toLowerCase() === 'tel' || /zip|postal/i.test(metadata.names?.[0] || '')) {
        const maxLen = Number(metadata.maxLength) > 0 ? metadata.maxLength : expectVal.length;
        expectVal = expectVal.replace(/\D/g, '').slice(0, maxLen);
      }
      let okTyped = false;
      // 3 lần gõ lại + 1 lần kiểm tra cuối: trước đây lần fill() thứ 3 không được kiểm tra lại, nên ô đã đúng
      // vẫn bị báo "không giữ được giá trị", bỏ cờ filled và vòng quét sau gõ đè email lần nữa.
      for (let retry = 0; retry <= 3; retry++) {
        const current = await field.inputValue().catch(() => '');
        if (current.trim() === expectVal.trim()) {
          okTyped = true;
          break;
        }
        if (retry === 3) break;
        if (retry === 2 && typeof field.fill === 'function') {
          await field.fill(expectVal, {
            force: true,
            timeout: 2000
          }).catch(() => {});
        } else {
          await humanType(field, expectVal, page, {
            simulateTypo: false
          });
        }
      }
      if (!okTyped) {
        const finalVal = await field.inputValue().catch(() => '');
        options.onLog?.({
          type: 'field_fill_verify_failed',
          field: metadata.names?.[0] || metadata.id || 'input',
          detail: `[Verify] Ô không giữ được giá trị sau 3 lần thử — hiện "${String(finalVal).slice(0, 40)}" (mong đợi "${String(expectVal).slice(0, 40)}"). KHÔNG đánh dấu filled để vòng quét sau điền lại.`
        }, page);
        await field.evaluate?.(el => el.removeAttribute('data-ux-filled')).catch(() => {});
        await field.evaluate?.(el => {
          const parent = el.closest('.field-group, .form-group, .defaultform__form-group, .input-group');
          if (parent && parent.classList.contains('valid')) {
            parent.classList.remove('valid', 'non-empty');
          }
        }).catch(() => {});
        return true; // bỏ qua, không cộng filledInThisPass — vòng quét sau thử lại
      }
    }

    // Với ô địa chỉ (Street Address / City / State / Zip), nếu xuất hiện dropdown gợi ý autocomplete (Google Places, Loqate, PCA, ARIA listbox, Mapbox, v.v.),
    // BẮT BUỘC phải chờ API trả về và click chọn mục gợi ý đầu tiên thì web mới hợp lệ hóa địa chỉ để cho phép submit!
    const isAddressField = metadata.names.some(n => /address|street|diachi/i.test(n));
    const isCityOrStateField = metadata.names.some(n => /city|thanhpho|state|tinh|province|make|model|school|college|job/i.test(n));
    const isComboboxOrAutocomplete = Boolean(metadata.ariaAutoComplete || metadata.classes?.includes('autocomplete') || metadata.classes?.includes('typeahead') || metadata.names?.some(n => /autocomplete|suggest/i.test(n)));
    let selectedSuggestion = false;
    if (isAddressField || isComboboxOrAutocomplete) {
      try {
        // 1. Kích hoạt trigger API gợi ý: focus và dispatch input
        await field.evaluate(el => {
          el.focus();
          el.dispatchEvent(new Event('input', {
            bubbles: true
          }));
          el.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowDown',
            bubbles: true
          }));
        }).catch(() => {});

        // 2. Chờ API gợi ý hoặc dropdown select trả về: Kiểm tra ngay lập tức ở nhịp đầu (30ms), sau đó thăm dò mỗi 80ms (phản hồi siêu nhanh < 50ms)
        for (let poll = 0; poll < 6; poll++) {
          const waitMs = poll === 0 ? 30 : 80;
          if (page && typeof page.waitForTimeout === 'function') {
            await page.waitForTimeout(waitMs).catch(() => {});
          } else {
            await new Promise(r => setTimeout(r, waitMs));
          }
          const hasOpen = await hasActiveAddressSuggestions(page, frame);
          if (hasOpen) {
            selectedSuggestion = await selectFirstAddressSuggestion(page, frame, field, options);
            if (selectedSuggestion) break;
          }

          // Kiểm tra xem trang có trả về thẻ <select> địa chỉ đi kèm không (ô vừa input vừa select)
          const selectRes = await handleAddressSelectDropdown(frame, record);
          if (selectRes && selectRes.success) {
            selectedSuggestion = true;
            options.onLog?.({
              type: 'address_suggestion_selected',
              detail: `[Address Select] Đã tự động chọn địa chỉ từ dropdown <select>: [${(selectRes.text || '').slice(0, 40)}]`
            }, page);
            break;
          }
        }

        // 3. Fallback: Nếu chưa chọn được, thử lại qua handleAddressSelectDropdown hoặc ArrowDown + Enter
        if (!selectedSuggestion) {
          const selectRes = await handleAddressSelectDropdown(frame, record);
          if (selectRes && selectRes.success) {
            selectedSuggestion = true;
            options.onLog?.({
              type: 'address_suggestion_selected',
              detail: `[Address Select] Đã chọn địa chỉ từ <select>: [${(selectRes.text || '').slice(0, 40)}]`
            }, page);
          } else {
            const hasOpen = await hasActiveAddressSuggestions(page, frame);
            if (hasOpen) {
              const downSteps = Math.random() < 0.5 ? 1 : 2;
              for (let d = 0; d < downSteps; d++) {
                await field.press('ArrowDown').catch(() => {});
              }
              await field.press('Enter').catch(() => {});
            }
          }
        }
      } catch {}

      // Đảm bảo sau khi xử lý autocomplete, ô địa chỉ không bị widget xóa trắng
      const postAddressVal = await field.inputValue().catch(() => '');
      if (!postAddressVal || postAddressVal.trim() === '') {
        await field.evaluate((el, val) => {
          const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
          const desc = Object.getOwnPropertyDescriptor(proto, 'value');
          if (desc?.set) desc.set.call(el, val);else el.value = val;
          el.classList.remove('error');
          el.classList.add('has-value');
          const parent = el.closest('.input-group, .loco-group, .form-group');
          if (parent) {
            parent.classList.remove('error');
            const helper = parent.querySelector('.helper-text, .error');
            if (helper) helper.classList.remove('visible');
          }
          el.dispatchEvent(new Event('input', {
            bubbles: true
          }));
          el.dispatchEvent(new Event('change', {
            bubbles: true
          }));
        }, String(valueToFill)).catch(() => {});
      }
    } else if (isCityOrStateField) {
      // Với ô city/state/job/school thông thường (không phải ô autocomplete chuyên biệt):
      // Kiểm tra nhanh trong < 1ms xem có dropdown đang mở hay không, nếu không mở thì đi tiếp ngay
      try {
        const hasOpen = await hasActiveAddressSuggestions(page, frame);
        if (hasOpen) {
          selectedSuggestion = await selectFirstAddressSuggestion(page, frame, field, options);
        }
      } catch {}
    }

    // CHỈ dispatch thêm input/change/blur/keyup NẾU CHƯA CHỌN GỢI Ý.
    // Nếu ĐÃ CHỌN GỢI Ý TỪ API HOẶC SELECT THÀNH CÔNG, TUYỆT ĐỐI KHÔNG dispatch lại blur
    // vì sẽ làm widget địa chỉ (Google Places/Loqate/AlphaIntent) hủy bỏ place_id đã chọn hoặc ẩn dropdown!
    if (!selectedSuggestion) {
      await field.evaluate(el => {
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
      }).catch(() => {});
      await field.dispatchEvent('input').catch(() => {});
      await field.dispatchEvent('change').catch(() => {});
      await field.dispatchEvent('blur').catch(() => {});
    } else {
      await field.evaluate(el => {
        el.dataset.uxFilled = '1';
        el.classList.add('valid-address', 'has-value');
        el.classList.remove('error');
      }).catch(() => {});
    }
  }
  return false;
}
