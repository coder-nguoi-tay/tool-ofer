import { resolveActionTarget } from '../../ai-assist/resolve-action-target.mjs';
import { humanClick } from '../human-click.mjs';

/**
 * Click Save đã sẵn sàng và ghi lượt lưu thành công; không bấm Cancel hoặc Continue.
 * @param {object} context Frame, tab, selector Save, bộ đếm và callback log.
 * @return {Promise<object>} Quyết định giữ bước và số click Save đã thực hiện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function clickSurveySave({ frame, page, selector, state, options }) {
  const target = await resolveActionTarget(frame, selector);
  if (!target.locator || !await humanClick(page, target.locator)) return { handled: true, actions: 0 };
  state.attempts++;
  state.nextAt = Date.now() + 1500;
  options.onLog?.({ type: 'survey_save_clicked', detail: 'Đã bấm Save của subform; chờ lưu xong trước khi Tiếp tục.' }, page);
  return { handled: true, actions: 1 };
}
