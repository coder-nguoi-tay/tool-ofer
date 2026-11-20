import { getRecordPhoneMask } from './record-values/resolve-record-phone.mjs';
import { markValidFormValue } from './mark-valid-form-value.mjs';
import { resolveContactField } from './resolve-contact-field.mjs';
import { validateSsnMatch } from './record-values/restrict-profile-field.mjs';
import { reportSelectMismatch } from './report-select-mismatch.mjs';
import { shouldStopAfterLead } from './should-stop-after-lead.mjs';
import { buildSelectCandidates } from './select/build-select-candidates.mjs';
import { selectOptionWithHumanInteraction } from './select/select-option-with-human-interaction.mjs';
import { scrollToFormControl } from './form-scope/scroll-to-form-control.mjs';
import { addVerifiedFieldCount } from './add-verified-field-count.mjs';
import { handleAddressSelectDropdown } from './handle-address-select-dropdown.mjs';
import { hasActiveAddressSuggestions } from './has-active-address-suggestions.mjs';
import { readAddressSelection } from './read-address-selection.mjs';
import { humanClick } from './human-click.mjs';
import { humanType } from './human-type.mjs';
import { parseDobComponents } from './parse-dob-components.mjs';
import { selectFirstAddressSuggestion } from './select-first-address-suggestion.mjs';
import { recordInputFillHtml } from '../logging/record-input-fill-html.mjs';

/**
 * Điền giá trị vào select hoặc ô nhập và xử lý chọn địa chỉ gợi ý.
 * @param {object} context Trường hoặc frame đang xử lý cùng dữ liệu và tiến độ của lượt quét.
 * @return {Promise<boolean>} True khi cần bỏ qua trường hiện tại.
 * @throws {never} Lỗi từng thao tác nhập được xử lý, HTML chỉ là bằng chứng bổ sung.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
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
  if (page?._manualCaptchaPending || shouldStopAfterLead(session || page?._autofillSession)) return true;
  const contact = resolveContactField(metadata);
  if (contact === 'conflict' || contact.startsWith('ssn') && !validateSsnMatch(contact, valueToFill, record, metadata.maxLength)) return true;
  if (metadata.kind === 'select') {
    const candidates = buildSelectCandidates(valueToFill, metadata);
    const result = await selectOptionWithHumanInteraction({ page, field, candidates }).catch(() => ({ matched: false, verified: false, reason: 'select_unavailable' }));
    // navigated: trang đã chuyển ngay khi chọn — không coi là ô chưa khớp.
    if (page?._manualCaptchaPending) return true;
    if (!result.verified && result.reason !== 'navigated') {
      const identity = metadata.id || metadata.name || metadata.names?.[0] || 'select';
      unmatchedFieldNames?.add(identity);
      reportSelectMismatch(frame || page, metadata, candidates, result, options, page);
    }
    return result;
  } else if (metadata.type === 'date') {
    const isoDate = parseDobComponents(valueToFill)?.isoDob;
    if (!isoDate) return true;
    const acceptsDate = await field.evaluate((input, candidate) => {
      const probe = input.cloneNode(false);
      probe.value = candidate;
      return probe.value === candidate && probe.validity.valid;
    }, isoDate).catch(() => false);
    if (!acceptsDate) return true;
    if (page?.mouse && !await humanClick(page, field)) return true;
    // <input type="date"> KHÔNG gõ từng ký tự được (keyboard gõ ISO sẽ bị
    // segment theo locale nuốt sai thứ tự MM/DD/YYYY). Phải set chuỗi ISO
    // trực tiếp qua fill() hoặc native value setter rồi bắn sự kiện.
    options.onLog?.({
      type: 'date_fill_attempt',
      field: metadata.names?.[0] || metadata.id || 'date',
      detail: `[DateFill] Thử điền ô ngày ${metadata.id || metadata.name} với ${isoDate}`
    });
    try {
      await recordInputFillHtml(field, page);
      if (page?._manualCaptchaPending) return true;
      await field.fill(isoDate, {
        force: true,
        timeout: 2000
      });
    } catch {}
    // Xác minh: nếu fill không ăn (validator trang xóa), set bằng native setter
    const dateVal = await field.inputValue().catch(() => '');
    if (page?._manualCaptchaPending) return true;
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
    if (page?._manualCaptchaPending) return true;
    if (finalDateVal && finalDateVal.trim() === isoDate) {
      await field.dispatchEvent('change').catch(() => {});
      await field.dispatchEvent('blur').catch(() => {});
      if (page?._manualCaptchaPending || !await field.evaluate(markValidFormValue, finalDateVal).catch(() => false)) return true;
      options.onLog?.({
        type: 'field_filled',
        tag: 'INPUT',
        id: metadata.id || null,
        name: metadata.name || null,
        text: metadata.names?.[0] || 'date',
        detail: `Đã điền ô ngày [${metadata.id || metadata.name}]: ${finalDateVal}`
      }, page);
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
    if ((/^phone/.test(contact) || contact === 'zipcode') && metadata.maxLength > 0
        && String(valueToFill).replace(/\D/g, '').length > metadata.maxLength) return true;
    const isAddressField = contact ? contact === 'address' : metadata.names.some(n => /address|street|diachi/i.test(n) && !/email/i.test(n));
    const requestedAddress = String(valueToFill);
    if (isAddressField) {
      const choice = await field.evaluate(readAddressSelection, requestedAddress).catch(() => null);
      if (choice?.retained || choice?.pending) return true;
      if (page?._manualCaptchaPending) return true;
      await field.evaluate((input, query) => {
        if (input._autoleadAddressChoice?.query !== query) delete input._autoleadAddressChoice;
        input._autoleadAddressQuery = query;
      }, requestedAddress).catch(() => {});
      if (choice?.requiresSelection && (choice.display === requestedAddress || choice.attempted)) {
        await selectFirstAddressSuggestion(page, frame, field, options);
        return !(await field.evaluate(readAddressSelection, requestedAddress).catch(() => null))?.retained;
      }
    }
    // Nhập từ từ mô phỏng nhịp gõ phím của người thật (chống bị phát hiện bot autofill)
    await humanType(field, valueToFill, page, { address: isAddressField });
    if (page?._manualCaptchaPending) return true;
    const afterTyping = isAddressField && await field.evaluate(readAddressSelection, requestedAddress).catch(() => null);
    if (afterTyping?.retained) return false;
    if (afterTyping?.pending) return true;

    // XÁC MINH SAU GÕ (fix): framework có thể clear ô (type=tel + maxlength,
    // React/Angular reset) — trước đây chỉ set data-ux-filled="1" nên ô rỗng vẫn bị coi
    // là đã điền và Submit được bấm với ô trống ("Zip code must be 5 digits",
    // "Email address invalid" trên form defaultform/My Resource Helper).
    // Nếu giá trị không còn khớp: gõ lại tối đa 2 lần; lần cuối dùng fill() khẩn.
    {
      const expectVal = String(valueToFill);
      // Mặt nạ có thể đổi dấu phân cách. Giá trị bị mất chữ số vẫn phải báo chưa điền.
      const numericDisplay = !(contact === 'phone' && getRecordPhoneMask(metadata.pattern)) && (/^phone/.test(contact) || contact === 'zipcode' || /^\d+$/.test(expectVal))
        && /^[+\d ().-]+$/.test(expectVal);
      const sameValue = current => current.trim() === expectVal.trim()
        || (numericDisplay && /^[+\d ().-]+$/.test(current) && current.replace(/\D/g, '') === expectVal.replace(/\D/g, ''));
      let okTyped = false;
      // 3 lần gõ lại + 1 lần kiểm tra cuối: trước đây lần fill() thứ 3 không được kiểm tra lại, nên ô đã đúng
      // vẫn bị báo "không giữ được giá trị", bỏ cờ filled và vòng quét sau gõ đè email lần nữa.
      for (let retry = 0; retry <= 3; retry++) {
        if (page?._manualCaptchaPending || shouldStopAfterLead(session || page?._autofillSession)) return true;
        const current = await field.inputValue().catch(() => '');
        if (sameValue(current)) {
          okTyped = true;
          break;
        }
        if (isAddressField) {
          const choice = await field.evaluate(readAddressSelection, requestedAddress).catch(() => null);
          if (choice?.retained) return false;
          if (choice?.pending) return true;
        }
        if (retry === 3) break;
        if (retry === 2 && typeof field.fill === 'function') {
          await recordInputFillHtml(field, page);
          if (page?._manualCaptchaPending) return true;
          await field.fill(expectVal, {
            force: true,
            timeout: 2000
          }).catch(() => {});
        } else {
          await humanType(field, expectVal, page, {
            address: isAddressField, simulateTypo: false
          });
        }
      }
      if (page?._manualCaptchaPending) return true;
      if (!okTyped) {
        const finalVal = await field.inputValue().catch(() => '');
        options.onLog?.({
          type: 'field_fill_verify_failed',
          field: metadata.names?.[0] || metadata.id || 'input',
          detail: `[Verify] Ô không giữ được giá trị sau 3 lần thử — hiện "${String(finalVal).slice(0, 40)}" (mong đợi "${String(expectVal).slice(0, 40)}"). KHÔNG đánh dấu filled để vòng quét sau điền lại.`
        }, page);
        await field.evaluate?.(el => el.removeAttribute('data-ux-filled')).catch(() => {});
        return true; // bỏ qua, không cộng filledInThisPass — vòng quét sau thử lại
      }
    }

    // Chỉ chấp nhận gợi ý xác định được cho ô vừa nhập.
    const isCityOrStateField = metadata.names.some(n => /city|thanhpho|state|tinh|province|make|model|school|college|job/i.test(n));
    const isComboboxOrAutocomplete = Boolean(metadata.ariaAutoComplete || metadata.classes?.includes('autocomplete') || metadata.classes?.includes('typeahead') || metadata.names?.some(n => /autocomplete|suggest/i.test(n)));
    let selectedSuggestion = false;
    if (isAddressField || isComboboxOrAutocomplete) {
      try {
        // 1. Kích hoạt trigger API gợi ý: focus và dispatch input
        if (page?._manualCaptchaPending) return true;
        if (!afterTyping?.requiresSelection) await field.evaluate(el => {
          el.focus();
          el.dispatchEvent(new Event('input', {
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
          if (page?._manualCaptchaPending) return true;
          const hasOpen = await hasActiveAddressSuggestions(page, frame, field);
          if (hasOpen) {
            selectedSuggestion = await selectFirstAddressSuggestion(page, frame, field, options);
            if (selectedSuggestion) break;
          }

          // Kiểm tra xem trang có trả về thẻ <select> địa chỉ đi kèm không (ô vừa input vừa select)
          if (!isAddressField) continue;
          if (page?._manualCaptchaPending) return true;
          const selectRes = await handleAddressSelectDropdown(frame, record, field);
          if (selectRes && selectRes.success) {
            selectedSuggestion = true;
            options.onLog?.({
              type: 'address_suggestion_selected',
              detail: `[Address Select] Đã tự động chọn địa chỉ từ dropdown <select>: [${(selectRes.text || '').slice(0, 40)}]`
            }, page);
            break;
          }
        }

      } catch {}

      // Widget có thể xóa địa chỉ vừa nhập khi xác minh thất bại.
      const postAddressVal = await field.inputValue().catch(() => '');
      const retainedAfterPick = isAddressField && await field.evaluate(readAddressSelection, requestedAddress).catch(() => null);
      if (retainedAfterPick?.retained) return false;
      if (retainedAfterPick?.pending || retainedAfterPick?.requiresSelection) return true;
      if (page?._manualCaptchaPending) return true;
      if (!selectedSuggestion && (!postAddressVal || postAddressVal.trim() === '')) {
        return true;
      }
    } else if (isCityOrStateField) {
      // Với ô city/state/job/school thông thường (không phải ô autocomplete chuyên biệt):
      // Kiểm tra nhanh trong < 1ms xem có dropdown đang mở hay không, nếu không mở thì đi tiếp ngay
      try {
        if (page?._manualCaptchaPending) return true;
        const hasOpen = await hasActiveAddressSuggestions(page, frame, field);
        if (hasOpen) {
          selectedSuggestion = await selectFirstAddressSuggestion(page, frame, field, options);
        }
      } catch {}
    }

    // CHỈ dispatch thêm input/change/blur/keyup NẾU CHƯA CHỌN GỢI Ý.
    // Nếu ĐÃ CHỌN GỢI Ý TỪ API HOẶC SELECT THÀNH CÔNG, TUYỆT ĐỐI KHÔNG dispatch lại blur
    // vì sẽ làm widget địa chỉ (Google Places/Loqate/AlphaIntent) hủy bỏ place_id đã chọn hoặc ẩn dropdown!
    if (page?._manualCaptchaPending) return true;
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
      for (const eventType of ['input', 'change', 'blur']) {
        if (page?._manualCaptchaPending) return true;
        await field.dispatchEvent(eventType).catch(() => {});
      }
    }
  }
  return false;
}
