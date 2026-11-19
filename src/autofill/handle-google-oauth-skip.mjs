import { resolveActiveFormScope } from './form-scope/resolve-active-form-scope.mjs';
import { locateFormElements } from './form-scope/locate-form-elements.mjs';
import { humanClick } from './human-click.mjs';

/**
 * Bấm nút Skip của bước đang hoạt động khi nút hiện và còn thuộc đúng form.
 * @param {object} page Trang Playwright hiện tại.
 * @param {object} frame Frame sở hữu bước.
 * @param {object} [options={}] Tùy chọn ghi nhận thao tác.
 * @return {Promise<number>} Một khi nút nhận thao tác, không khi bị từ chối.
 * @throws {never} Bỏ qua lượt quét khi frame thay đổi hoặc nút chưa sẵn sàng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export async function handleGoogleOauthSkip(page, frame, options = {}) {
  if (!frame?.locator || Date.now() - (frame._uxGmailSkipHandledAt || 0) < 2000) return 0;
  const scope = frame._activeAutofillFormScope === undefined ? await resolveActiveFormScope(frame) : frame._activeAutofillFormScope;
  if (!scope?.active || scope.unavailable) return 0;
  frame._uxGmailSkipHandledAt = Date.now();
  const skipButton = locateFormElements(frame, '#skip_offer', scope).first();
  if (!await skipButton.isVisible().catch(() => false)) return 0;
  const control = await skipButton.elementHandle({ timeout: 300 }).catch(() => null);
  if (!control) return 0;
  try {
    if (await control.getAttribute('data-ux-gmail-skip-clicked').catch(() => '1') === '1') return 0;
    if (!await humanClick(page, control)) return 0;
    await control.evaluate(element => element.setAttribute('data-ux-gmail-skip-clicked', '1')).catch(() => {});
    options.onLog?.({ type: 'gmail_oauth_skipped', detail: 'Đã bấm Skip trong form đang hoạt động.' });
    return 1;
  } finally { await control.dispose().catch(() => {}); }
}
