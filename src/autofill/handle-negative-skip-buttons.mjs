import { resolveActiveFormScope } from './form-scope/resolve-active-form-scope.mjs';
import { locateFormElements } from './form-scope/locate-form-elements.mjs';
import { humanClick } from './human-click.mjs';

/**
 * Bấm tối đa một nút bỏ qua trong phạm vi form/câu hỏi đã xác minh của frame.
 * @param {object} frame Frame hoặc Page đang quét.
 * @return {Promise<number>} Một khi nút nhận thao tác, không khi chưa xác minh được.
 * @throws {never} Bỏ qua lượt quét khi nút biến mất hoặc frame không đọc được.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export async function handleNegativeSkipButtons(frame) {
  if (!frame?.locator) return 0;
  const scope = frame._activeAutofillFormScope === undefined ? await resolveActiveFormScope(frame) : frame._activeAutofillFormScope;
  if (!scope?.active || scope.unavailable) return 0;
  const skipSelector = ['button[data-element-type="negative_button"]', 'button.creative-button-negative', 'button.skip-btn', 'a.skip-btn', 'button.skip-button', 'button.ai-skip', 'a.ai-skip', 'button.skip-button-text', '[data-action="skip"]', 'button:has-text("No, I don\'t need extra money")', 'button:has-text("I don\'t want my gift")', 'button:has-text("No, Skip")', 'button:has-text("None/Skip")', 'button:has-text("No Thanks")', 'a:has-text("No Thanks")', 'button:has-text("Skip")'].join(', ');
  const buttons = await locateFormElements(frame, skipSelector, scope).all().catch(() => []);
  for (const button of buttons) {
    if (!await button.isVisible().catch(() => false)) continue;
    if (await button.getAttribute('data-ux-clicked').catch(() => '1') === '1') continue;
    const control = await button.elementHandle({ timeout: 300 }).catch(() => null);
    if (!control) return 0;
    try {
      if (!await humanClick(frame.page?.() || frame, control)) return 0;
      await control.evaluate(element => element.setAttribute('data-ux-clicked', '1')).catch(() => {});
      return 1;
    } finally { await control.dispose().catch(() => {}); }
  }
  return 0;
}
