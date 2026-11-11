import { shouldPauseForLead } from './should-pause-for-lead.mjs';
import { isControlInActiveForm } from './form-scope/is-control-in-active-form.mjs';
import { collectFieldMetadata } from './collect-field-metadata.mjs';
import { fillSelectOrTextField } from './fill-select-or-text-field.mjs';
import { handleExistingFieldValue } from './handle-existing-field-value.mjs';
import { handleUnmatchedField } from './handle-unmatched-field.mjs';
import { handleCheckboxField } from './handle-checkbox-field.mjs';
import { addVerifiedFieldCount } from './add-verified-field-count.mjs';
import { isEmailFieldName } from './is-email-field-name.mjs';
import { matchFieldValue } from './match-field-value.mjs';

/**
 * Điền lần lượt các trường trong frame và ghi nhận những ô đã được xác minh.
 * @param {object} context Frame, dữ liệu lead và tiến độ của lượt quét.
 * @return {Promise<boolean>} True khi cần dừng quét trang.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function fillFrameFields({
  fields,
  session,
  page,
  options,
  frameProgress,
  scanProgress,
  frame,
  record,
  unmatchedFieldNames
}) {
  for (const field of fields) {
    if (typeof field.count === 'function' && !await field.count().catch(() => 0)) continue;
    if (shouldPauseForLead(session, options)) return true;
    try {
      if (frameProgress.formScope && !await field.evaluate(isControlInActiveForm, frameProgress.formScope).catch(() => false)) continue;
      const isEnabled = await field.isEnabled().catch(() => true);
      if (!isEnabled) {
        // Log 1 lần mỗi ô mỗi pass để truy vết trường bị khóa (fieldset disabled)
        const skipId = await field.evaluate(el => el.id || el.name || '').catch(() => '');
        if (skipId && !page._uxDisabledSkipLogged) page._uxDisabledSkipLogged = new Set();
        if (skipId && !page?._uxDisabledSkipLogged?.has(skipId)) {
          page._uxDisabledSkipLogged.add(skipId);
          options.onLog?.({
            type: 'field_disabled_skip',
            field: skipId,
            detail: `[Scan] Bỏ qua ô "${skipId}" vì trường đang disabled (fieldset/step khóa)`
          });
        }
        continue;
      }

      // Bảo vệ chống bẫy honeypot (như trên find.mysamplesearchtwentythree.com):
      const isHoneypot = await field.evaluate(el => {
        if (el.closest('[inert]')) return true;
        const parent = el.closest('div, span');
        if (parent) {
          const s = parent.style;
          if (s.left === '-9999px' || s.top === '-9999px' || s.opacity === '0' && s.width === '1px') return true;
        }
        const rect = el.getBoundingClientRect();
        let pagePositionLeft = rect.left + window.scrollX;
        let pagePositionTop = rect.top + window.scrollY;
        for (let parent = el.parentElement; parent; parent = parent.parentElement) {
          pagePositionLeft += parent.scrollLeft || 0;
          pagePositionTop += parent.scrollTop || 0;
        }
        if (pagePositionLeft < -100 || pagePositionTop < -100 || rect.width <= 1 && rect.height <= 1) return true;
        const name = (el.name || el.id || '').toLowerCase();
        if (['website', 'address3', 'confirm_email', 'emailidaddress'].includes(name) && pagePositionTop < 0) return true;
        return false;
      }).catch(() => false);
      if (isHoneypot) {
        const hpId = await field.evaluate(el => el.id || el.name || '').catch(() => '');
        if (!page._uxHoneypotLogged) page._uxHoneypotLogged = new Set();
        if (hpId && !page._uxHoneypotLogged.has(hpId)) {
          page._uxHoneypotLogged.add(hpId);
          options.onLog?.({
            type: 'field_honeypot_skip',
            field: hpId,
            detail: `[Scan] Bỏ qua ô "${hpId}" vì nghi là honeypot (ẩn / nằm ngoài màn hình)`
          });
        }
        continue;
      }
      const isCheckbox = await field.evaluate(el => el.type === 'checkbox').catch(() => false);
      const isSelect = await field.evaluate(el => el.tagName === 'SELECT').catch(() => false);
      if (isCheckbox) {
        // Với checkbox, nhiều trang ẩn thẻ <input> (display:none, opacity:0, sr-only) và hiển thị qua <label> hoặc custom checkmark.
        // Do đó chỉ bỏ qua nếu CẢ input VÀ label/container bao ngoài đều bị ẩn hoàn toàn
        const isInputOrLabelVisible = await field.evaluate(el => {
          if (el.offsetWidth > 0 || el.offsetHeight > 0 || el.offsetParent !== null) return true;
          const label = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
          if (label && (label.offsetWidth > 0 || label.offsetHeight > 0 || label.offsetParent !== null)) return true;
          const parent = el.closest('.form-group, .custom-control, .checkbox, .field, .input-container, label, div');
          if (parent && (parent.offsetWidth > 0 || parent.offsetHeight > 0 || parent.offsetParent !== null)) return true;
          return false;
        }).catch(() => false);
        if (!isInputOrLabelVisible) continue;
      } else if (isSelect) {
        // Với <select>, nhiều framework (Select2, Choices, React-Select) ẩn thẻ gốc
        // Chỉ bỏ qua nếu form hoặc container cha của nó bị ẩn hoàn toàn
        const isSelectContainerVisible = await field.evaluate(el => {
          if (el.offsetWidth > 0 || el.offsetHeight > 0 || el.offsetParent !== null) return true;
          const parent = el.closest('form, .select, .custom-select, .form-group, .field, .input-container, div');
          if (parent && (parent.offsetWidth > 0 || parent.offsetHeight > 0 || parent.offsetParent !== null)) return true;
          return false;
        }).catch(() => false);
        if (!isSelectContainerVisible) continue;
      } else {
        if (!(await field.isVisible())) {
          const invId = await field.evaluate(el => el.id || el.name || '').catch(() => '');
          if (!page._uxInvisibleLogged) page._uxInvisibleLogged = new Set();
          if (invId && !page._uxInvisibleLogged.has(invId)) {
            page._uxInvisibleLogged.add(invId);
            options.onLog?.({
              type: 'field_invisible_skip',
              field: invId,
              detail: `[Scan] Bỏ qua ô "${invId}" vì không visible`
            });
          }
          continue;
        }
      }
      // Chống gõ đè: ô đang được gõ bởi vòng trước (lock tươi < 30s) thì bỏ qua
      const typingMarker = await field.getAttribute('data-ux-typing').catch(() => null);
      if (typingMarker) {
        if (Date.now() - Number(typingMarker || 0) < 30000) continue;
        // Lock quá hạn = vòng gõ cũ đã chết → dọn lock và cho phép gõ lại
        await field.evaluate(el => el.removeAttribute('data-ux-typing')).catch(() => {});
      }
      const isMarkedFilled = (await field.getAttribute('data-ux-filled')) === '1';
      if (isMarkedFilled) {
        const isUncheckedBox = isCheckbox && !(await field.isChecked().catch(() => true));
        const currentVal = await field.inputValue().catch(() => null);
        const hasError = await field.evaluate(el => {
          if (el.classList.contains('error') || el.classList.contains('invalid') || el.getAttribute('aria-invalid') === 'true') return true;
          const parent = el.closest('.input-group, .form-group, .field, .field-item, .reg-fields, .reg-section, .loco-group, .checkbox-group, .checkbox, label, div');
          if (!parent) return false;
          if (parent.classList.contains('invalid') || parent.classList.contains('error')) return true;
          return parent.querySelector('.error, .error-entry, .invalid, .visible, .helper-text.visible, [role="alert"]') !== null;
        }).catch(() => false);

        // Nếu đã fill nhưng giá trị hiện tại bị rỗng hoặc đang bị báo lỗi hoặc là checkbox chưa được tích -> xóa mark để điền lại
        if (currentVal !== null && currentVal.trim() === '' || hasError || isUncheckedBox) {
          await field.evaluate(el => el.removeAttribute('data-ux-filled')).catch(() => {});
        } else {
          continue;
        }
      }
      const metadata = await field.evaluate(collectFieldMetadata, undefined, { timeout: 1500 });
      session.autofillStep = `điền trường ${metadata.type || metadata.kind || 'input'} (${metadata.id || metadata.name || 'không có tên'})`;

      // Nhận diện trường email ngay khi lấy metadata của trường
      const isEmailVal = (metadata.type === 'email' || metadata.names?.some(isEmailFieldName) || metadata.value && metadata.value.includes('@')) && !metadata.names?.some(n => /address|street|diachi/i.test(n));
      if (isEmailVal) {
        frameProgress.frameHasEmail = true;
        session.screenHasEmail = true;
        if (metadata.value && metadata.value.includes('@')) {
          session.emailFilled = true;
          session.emailScreenNumber = (session.completedScreens || 0) + 1;
        }
      }

      // Xử lý ô checkbox: chỉ tích ô BẮT BUỘC TÍCH (consent / checkbox đơn /
      // nhóm multi-select chưa ai chọn, trừ "None of the above").
      // Câu hỏi multi-select dùng checkbox tôn trọng lựa chọn có chủ đích
      // của solveSurveyCheckboxes — không tick nốt phần còn lại.
      if (await handleCheckboxField({
        metadata,
        scanProgress,
        field,
        page,
        frame,
        session,
        frameProgress,
        options
      })) continue;
      if (metadata.readOnly || ['hidden', 'radio', 'file', 'submit', 'button', 'reset', 'image', 'search'].includes(metadata.type)) continue;
      const valueToFill = matchFieldValue(metadata.names, record, {
        ...metadata,
        assignedEmail: session.assignedEmail || record.assignedEmail
      });
      if (await handleUnmatchedField({
        valueToFill,
        metadata,
        field,
        session,
        frameProgress,
        unmatchedFieldNames,
        record,
        options
      })) continue;

      // Bỏ qua nếu ô đã có giá trị thật (ngoại trừ mask rỗng như (___) ___-____, +1, mm/dd/yyyy hoặc email/zip chưa hợp lệ)
      if (await handleExistingFieldValue({
        metadata,
        valueToFill,
        field
      })) continue;
      const fillResult = await fillSelectOrTextField({
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
      });
      if (fillResult === true || fillResult?.verified === false) continue;

      // Kiểm tra chắc chắn trường đã có giá trị thực tế trước khi đánh dấu thành công
      let finalVal = '';
      if (metadata.kind === 'select') {
        finalVal = await field.evaluate(el => el.value || '').catch(() => '');
        if (!fillResult?.verified || finalVal !== fillResult.value) continue;
      } else {
        finalVal = await field.inputValue().catch(() => '');
      }
      if (!finalVal || finalVal.trim() === '') {
        // Trường vẫn rỗng, không đánh dấu và không tính là đã điền
        continue;
      }
      await field.evaluate(element => {
        element.dataset.uxFilled = '1';
        element.classList.remove('error', 'invalid');
        element.classList.add('has-value', 'valid');
        const parent = element.closest('.input-group, .loco-group, .form-group, .field, .field-item, .reg-fields');
        if (parent) {
          parent.classList.remove('error', 'invalid');
          parent.classList.add('valid', 'non-empty');
          const helper = parent.querySelector('.helper-text, .error, .error-entry');
          if (helper) {
            helper.classList.remove('visible');
            helper.style.display = 'none';
          }
        }
      }).catch(() => {});
      addVerifiedFieldCount(session, 1);
      session.lastActionTime = Date.now();
      session.autofillError = null;
      frameProgress.filledInThisPass += 1;
      options.onLog?.({
        type: 'field_filled',
        tag: (metadata.kind || 'input').toUpperCase(),
        id: metadata.id || metadata.name || null,
        name: metadata.name || null,
        text: String(valueToFill).slice(0, 50),
        detail: `Đã điền [${metadata.names?.[0] || metadata.id || 'ô'}]: ${String(valueToFill).slice(0, 30)}`
      }, page);
      const isFilledEmail = (metadata.type === 'email' || metadata.names?.some(isEmailFieldName) || valueToFill && String(valueToFill).includes('@')) && !metadata.names?.some(n => /address|street|diachi/i.test(n));
      if (isFilledEmail) {
        frameProgress.frameHasEmail = true;
        session.screenHasEmail = true;
        session.emailFilled = true;
        session.emailFillAt = Date.now();
        session.emailScreenNumber = (session.completedScreens || 0) + 1;
        console.log(`[Autofill] Đã điền trường email (${String(valueToFill).slice(0, 30)}). Đánh dấu màn hình này là màn điền email (Màn ${session.emailScreenNumber}).`);
      }

      // Dừng tự nhiên ngắn giữa 2 trường: vừa đủ nhịp chuyển mắt thực tế mà không gây cảm giác đơ/chậm máy
      const isRealBrowser = Boolean(page?.mouse && typeof page.mouse.move === 'function');
      const fieldPause = isRealBrowser ? Math.floor(Math.random() * 100) + 100 : Math.floor(Math.random() * 15) + 25;
      if (page && typeof page.waitForTimeout === 'function') {
        await page.waitForTimeout(fieldPause).catch(() => {});
      } else {
        await new Promise(resolve => setTimeout(resolve, fieldPause));
      }

      // Giảm thiểu khoảng nghỉ lơ đãng để tránh tình trạng đứng hình không bấm gì khi chạy đồng thời nhiều trình duyệt
      if (isRealBrowser && Math.random() < 0.05) {
        const driftPause = Math.floor(Math.random() * 150) + 150;
        if (page && typeof page.waitForTimeout === 'function') {
          await page.waitForTimeout(driftPause).catch(() => {});
        } else {
          await new Promise(resolve => setTimeout(resolve, driftPause));
        }
      }
    } catch {
      // Trường có thể không tương tác được lúc này
    }
  }

  // Nếu có trường vừa được điền hoặc tick trong pass này, chờ 50ms để DOM cập nhật trạng thái

  return false;
}
