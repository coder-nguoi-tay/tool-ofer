import { addVerifiedFieldCount } from './add-verified-field-count.mjs';
import { humanClick } from './human-click.mjs';

/**
 * Click checkbox/nhãn theo chiến lược consent và chỉ ghi tiến độ khi website xác nhận checked.
 * @param {object} context Trường hoặc frame đang xử lý cùng dữ liệu và tiến độ của lượt quét.
 * @return {Promise<boolean>} True khi cần bỏ qua trường hiện tại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function handleCheckboxField({
  metadata,
  scanProgress,
  field,
  page,
  frame,
  session,
  frameProgress,
  options
}) {
  if (metadata.type === 'checkbox') {
    scanProgress.visibleFieldCount += 1;
    const isAlreadyChecked = await field.isChecked().catch(() => metadata.checked);
    if (!isAlreadyChecked) {
      const cbGroupInfo = await field.evaluate(el => {
        const container = el.closest('.twy-customquestion, .question, .survey-question, fieldset, .checkbox-group, .choices, .form-group, .answers, .step-content') || el.parentElement || document.body;
        const siblings = Array.from(container.querySelectorAll('input[type="checkbox"]'));
        const label = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
        const text = ((label?.innerText || label?.textContent || '') + ' ' + (container.querySelector('h1, h2, h3, h4, legend, .question-title, .twy-cqlabel, p')?.innerText || '')).trim();
        return {
          isConsent: /terms|privacy|consent|agree|accept|tcpa|policy|disclosure|opt[- ]?in|waiver|certify|authorize|acknowledge/i.test(text),
          multiChoiceGroup: siblings.length >= 2,
          singleCheckbox: siblings.length === 1
        };
      }).catch(() => ({
        isConsent: false,
        multiChoiceGroup: false,
        singleCheckbox: false
      }));

      // Nhóm nhiều đáp án phải đi qua survey solver để chọn ngẫu nhiên đúng 2 ô.
      const allowedToTick = cbGroupInfo.singleCheckbox || cbGroupInfo.isConsent;
      if (!allowedToTick) return true;
      try {
        await field.scrollIntoViewIfNeeded({
          timeout: 600
        }).catch(() => {});
        const isRealBrowser = Boolean(page?.mouse && typeof page.mouse.move === 'function');
        const consentPause = isRealBrowser ? Math.floor(Math.random() * 120) + 140 : Math.floor(Math.random() * 30) + 30;
        if (page && typeof page.waitForTimeout === 'function') {
          await page.waitForTimeout(consentPause).catch(() => {});
        } else {
          await new Promise(r => setTimeout(r, consentPause));
        }

        // Nhãn checkbox ẩn được humanClick xử lý; chỉ ghi nhận checked do website xác nhận.
        if (!await humanClick(page, field)) return true;
        if (!await field.isChecked({ timeout: 1000 }).catch(() => false)) return true;
        await field.evaluate(el => {
          el.dataset.uxFilled = '1';
        }).catch(() => {});
        addVerifiedFieldCount(session, 1);
        session.autofillError = null;
        frameProgress.filledInThisPass += 1;
        const consentName = metadata.names?.[0] || metadata.id || metadata.name || 'checkbox';
        options.onLog?.({
          type: 'checkbox_checked',
          tag: 'INPUT',
          id: metadata.id || null,
          name: metadata.name || null,
          text: consentName.slice(0, 100),
          detail: `Đã tự động tích ô checkbox: ${metadata.id || metadata.name || consentName.slice(0, 50)}`
        }, page);
      } catch {}
    }
    return true;
  }
  return false;
}
