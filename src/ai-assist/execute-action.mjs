import { humanClick } from '../autofill/human-click.mjs';
import { isNoSurveyFrame } from '../autofill/adsmith/is-no-survey-frame.mjs';
import { performSurveyAnswer } from '../survey-solver/verification/perform-survey-answer.mjs';
import { inspectActionPurpose } from './inspect-action-purpose.mjs';
import { collectFieldMetadata } from '../autofill/collect-field-metadata.mjs';
import { resolveProvidedFieldValue } from '../autofill/record-values/resolve-provided-field-value.mjs';
import { buildSelectCandidates } from '../autofill/select/build-select-candidates.mjs';
import { selectOptionWithHumanInteraction } from '../autofill/select/select-option-with-human-interaction.mjs';
import { inspectActionField } from './inspect-action-field.mjs';
import { selectFirstAddressSuggestion } from '../autofill/select-first-address-suggestion.mjs';
import { clickReadyControl } from '../browser/locators/click-ready-control.mjs';
import { resolveActionTarget } from './resolve-action-target.mjs';
import { humanType } from '../../autofill.mjs';
import { addVerifiedFieldCount } from '../autofill/add-verified-field-count.mjs';

/**
 * Thực thi action AI và xác minh trạng thái DOM trước khi báo thành công.
 *
 * @param {object} page Playwright page.
 * @param {{action:string,selector?:string,value?:string}} act Action cần thực thi.
 * @param {object} [session=null] Phiên session để cập nhật số trường đã xác minh.
 * @param {object} policy Quyền repair và record có nguồn dữ liệu; không cho AI tự submit.
 * @return {Promise<{ok:boolean,verified:boolean,reason:string}>} Kết quả thao tác và xác minh.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
async function executeAction(page, act, session = null, policy = {}) {
  let {
    action,
    selector,
    value
  } = act ?? {};
  if (!selector) return {
    ok: false,
    verified: false,
    reason: 'missing_selector'
  };
  if (action === 'click' && selector.trim() === '[id="question-answers"]') {
    return {
      ok: false,
      verified: false,
      reason: 'answer_container_not_button'
    };
  }
  if (!page || typeof page.isClosed === 'function' && page.isClosed()) {
    return {
      ok: false,
      verified: false,
      reason: 'page_closed'
    };
  }
  const target = await resolveActionTarget(page, selector);
  if (!target.locator) return { ok: false, verified: false, reason: target.reason };
  const { locator } = target;
  try {
    if (await isNoSurveyFrame(target.frame)) return { ok: false, verified: false, reason: 'survey_owned_by_autofill' };
    if (policy.allowSubmit === false || policy.repairOnly) {
      const purpose = await locator.evaluate(inspectActionPurpose);
      if (action === 'click' && purpose.noise) return { ok: false, verified: false, reason: 'not_answer_control' };
      if (action === 'click' && purpose.submit) return { ok: false, verified: false, reason: 'submit_owned_by_autofill' };
      if (action === 'click' && purpose.semanticOwned) return { ok: false, verified: false, reason: 'semantic_owned' };
      if (policy.repairOnly || policy.providedValuesOnly) {
        if (['fill','type','select'].includes(action)) {
          const metadata = await locator.evaluate(collectFieldMetadata);
          const supplied = resolveProvidedFieldValue(metadata, policy.record || {}, session || {});
          if (supplied == null || supplied === '') return { ok: false, verified: false, reason: 'missing_record' };
          value = String(supplied);
          if (action === 'select') {
            const result = await selectOptionWithHumanInteraction({ page, field: locator, candidates: buildSelectCandidates(value, metadata) });
            if (!result.verified) return { ok: false, verified: false, reason: 'select_value_unmatched' };
            addVerifiedFieldCount(session);
            return { ok: true, verified: true, reason: 'selection_verified' };
          }
        } else if (policy.repairOnly && (action !== 'check' || !purpose.consent)) return { ok: false, verified: false, reason: 'repair_action_not_allowed' };
      }
    }
    if (action === 'fill' || action === 'type') {
      const fieldIdentity = await locator.evaluate(inspectActionField);
      if (fieldIdentity.readOnly) return { ok: false, verified: false, reason: 'element_readonly' };
      let fillValue = String(value ?? '');
      if (session?.assignedEmail && (fieldIdentity.email || /email|mail/i.test(selector) || /@/.test(fillValue))) {
        fillValue = session.assignedEmail;
      }
      await humanType(locator, fillValue, page);
      if (fieldIdentity.address || /address|street/i.test(selector)) {
        await locator.evaluate(el => {
          const field = el.matches?.('input, textarea') ? el : el.querySelector?.('input, textarea');
          if (!field) return;
          field.dispatchEvent(new Event('input', {
            bubbles: true
          }));
          field.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowDown',
            bubbles: true
          }));
        }).catch(() => {});
        await new Promise(r => setTimeout(r, 450));
        // Tự động tìm và chọn mục gợi ý hoặc thẻ <select> trả về sau khi gõ địa chỉ
        await selectFirstAddressSuggestion(page, target.frame, locator).catch(() => false);
      } else {
        await locator.evaluate(el => {
          const field = el.matches?.('input, textarea') ? el : el.querySelector?.('input, textarea');
          if (!field) return;
          field.dispatchEvent(new Event('input', {
            bubbles: true
          }));
          field.dispatchEvent(new Event('change', {
            bubbles: true
          }));
          field.dispatchEvent(new Event('blur', {
            bubbles: true
          }));
        });
      }
      const actualValue = typeof locator.inputValue === 'function' ? await locator.inputValue({
        timeout: 2000
      }).catch(() => locator.evaluate(el => {
        const field = el.matches?.('input, textarea') ? el : el.querySelector?.('input, textarea');
        return field?.value ?? (el.isContentEditable ? el.innerText : '');
      })) : await locator.evaluate(el => {
        const field = el.matches?.('input, textarea') ? el : el.querySelector?.('input, textarea');
        return field?.value ?? (el.isContentEditable ? el.innerText : '');
      });
      const normalizedExpected = String(fillValue).trim().normalize('NFKC');
      const normalizedActual = String(actualValue ?? '').trim().normalize('NFKC');
      const isEmail = fieldIdentity.email || /email|mail/i.test(selector) || /@/.test(fillValue);
      const matchesValue = isEmail ? normalizedActual.toLowerCase() === normalizedExpected.toLowerCase() : normalizedActual === normalizedExpected;
      if (!matchesValue) return {
        ok: false,
        verified: false,
        reason: 'value_not_present'
      };
      await locator.evaluate(el => {
        const field = el.matches?.('input, textarea') ? el : el.querySelector?.('input, textarea');
        field?.setAttribute('data-ux-ai-done', '1');
        field?.setAttribute('data-ux-filled', '1');
      }).catch(() => {});
      if (session) {
        addVerifiedFieldCount(session);
        session.lastActionTime = Date.now();
      }
      return {
        ok: true,
        verified: true,
        reason: 'value_verified'
      };
    }
    if (action === 'select') {
      if (page.mouse && !await humanClick(page, locator)) return { ok: false, verified: false, reason: 'click_failed' };
      let selected = false;
      try {
        await locator.selectOption(String(value ?? ''), {
          force: false,
          timeout: 2000
        });
        selected = true;
      } catch {
        try {
          await locator.selectOption({
            label: String(value ?? '')
          }, {
            force: false,
            timeout: 1000
          });
          selected = true;
        } catch {}
      }
      if (!selected) return {
        ok: false,
        verified: false,
        reason: 'select_failed'
      };
      const selectedOption = await locator.evaluate(el => {
        const option = el.selectedOptions?.[0];
        return option ? {
          value: option.value,
          label: (option.textContent || '').trim()
        } : null;
      }).catch(() => null);
      const expectedOption = String(value ?? '').trim();
      if (!selectedOption || selectedOption.value !== expectedOption && selectedOption.label !== expectedOption) {
        return {
          ok: false,
          verified: false,
          reason: 'selection_not_verified'
        };
      }
      await locator.evaluate(el => {
        el.dispatchEvent(new Event('input', {
          bubbles: true
        }));
        el.dispatchEvent(new Event('change', {
          bubbles: true
        }));
        el.setAttribute('data-ux-ai-done', '1');
        el.setAttribute('data-ux-filled', '1');
      });
      if (session) {
        addVerifiedFieldCount(session);
        session.lastActionTime = Date.now();
      }
      return {
        ok: true,
        verified: true,
        reason: 'selection_verified'
      };
    }
    if (action === 'check') {
      const alreadyChecked = await locator.evaluate(el => {
        const field = el.matches?.('input[type="checkbox"], input[type="radio"]') ? el : el.querySelector?.('input[type="checkbox"], input[type="radio"]');
        return Boolean(field?.checked || el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-pressed') === 'true' || el.classList?.contains('checked') || el.classList?.contains('selected') || el.classList?.contains('active'));
      }).catch(() => false);
      if (alreadyChecked) return {
        ok: true,
        verified: true,
        reason: 'already_checked'
      };
      const checked = await clickReadyControl(locator, target.readiness, page);
      const checkedState = checked ? await locator.evaluate(el => {
        const field = el.matches?.('input[type="checkbox"], input[type="radio"]') ? el : el.querySelector?.('input[type="checkbox"], input[type="radio"]');
        return Boolean(field?.checked || el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-pressed') === 'true' || el.classList?.contains('checked') || el.classList?.contains('selected') || el.classList?.contains('active'));
      }).catch(() => false) : false;
      if (!checkedState) return {
        ok: false,
        verified: false,
        reason: 'checked_state_not_verified'
      };
      await locator.evaluate(el => {
        el.setAttribute('data-ux-ai-done', '1');
        el.setAttribute('data-ux-filled', '1');
      }).catch(() => {});
      if (session) {
        addVerifiedFieldCount(session);
        session.lastActionTime = Date.now();
      }
      return {
        ok: true,
        verified: true,
        reason: 'checked_state_verified'
      };
    }
    if (action === 'click') {
      if (policy.allowSubmit === false) {
        const outcome = await performSurveyAnswer(target.frame, locator, policy);
        if (outcome.verified) { if (session) session.lastActionTime = Date.now(); return { ok: true, verified: true, reason: outcome.reason }; }
        return { ok: false, verified: false, reason: outcome.reason };
      }
      const clicked = await clickReadyControl(locator, target.readiness, page);
      if (!clicked) return {
        ok: false,
        verified: false,
        reason: 'click_failed'
      };
      await locator.evaluate(el => el.setAttribute('data-ux-clicked', '1')).catch(() => {});
      if (session) session.lastActionTime = Date.now();
      return {
        ok: true,
        verified: false,
        reason: 'click_dispatched'
      };
    }
    return {
      ok: false,
      verified: false,
      reason: 'unsupported_action'
    };
  } catch {
    return {
      ok: false,
      verified: false,
      reason: 'action_execution_error'
    };
  }
}
export { executeAction };
