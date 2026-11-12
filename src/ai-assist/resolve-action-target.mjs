import { ensureAvailableFormScope } from '../autofill/form-scope/ensure-available-form-scope.mjs';
import { normalizeElementSelector } from '../browser/locators/normalize-element-selector.mjs';
import { inspectInteractionReadiness } from '../browser/locators/inspect-interaction-readiness.mjs';
import { locateFormElements } from '../autofill/form-scope/locate-form-elements.mjs';

/**
 * Tìm control sẵn sàng trong frame/form hiện tại, hỗ trợ id dạng số và id trùng giữa các bước.
 * @param {object} page Tab sở hữu action AI.
 * @param {string} selector Selector AI đề xuất.
 * @return {Promise<object>} Locator, frame, readiness hoặc lý do từ chối chính xác.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function resolveActionTarget(page, selector) {
  const normalizedSelector = normalizeElementSelector(selector);
  const frames = page._activeAutofillFrame ? [page._activeAutofillFrame] : typeof page.frames === 'function' ? page.frames() : [page];
  let reason = 'selector_not_found';
  for (const frame of frames) {
    if (!await ensureAvailableFormScope(frame)) { reason = 'scope_unavailable'; continue; }
    const formScope = frame._activeAutofillFormScope;
    try {
      const candidates = locateFormElements(frame, normalizedSelector, formScope);
      const count = typeof candidates.count === 'function' ? await candidates.count() : 1;
      for (let index = 0; index < count; index++) {
        const locator = typeof candidates.nth === 'function' ? candidates.nth(index) : candidates.first();
        const readiness = await locator.evaluate(inspectInteractionReadiness, formScope || null);
        if (readiness.ready) return { locator, frame, readiness };
        reason = readiness.reason;
      }
    } catch (error) {
      if (/selector|syntax|parsing|Unexpected token/i.test(error.message)) return { reason: 'invalid_selector' };
      reason = 'element_unavailable';
    }
  }
  return { reason };
}
