import { humanClick } from '../human-click.mjs';
import { shouldStopAfterLead } from '../should-stop-after-lead.mjs';
import { waitForInputPacing } from '../interaction/wait-for-input-pacing.mjs';
import { inspectInteractionReadiness } from '../../browser/locators/inspect-interaction-readiness.mjs';

/**
 * Chọn đúng option sau click thật, không chọn đáp án trung gian hoặc phát sự kiện trùng.
 * @param {object} context Page, select và option đã khớp record.
 * @return {Promise<object>} Kết quả xác minh hoặc lý do giữ nguyên trường.
 * @throws {never} Lỗi điều hướng được phân biệt với lỗi giữ giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
export async function selectNativeOptionWithHumanInteraction({ page, field, target }) {
  if (shouldStopAfterLead(page?._autofillSession)) return { ...target, verified: false, reason: 'lead_confirmed_paused' };
  if (!await humanClick(page, field)) return { ...target, verified: false, reason: 'click_failed' };
  await waitForInputPacing(page);
  if (shouldStopAfterLead(page?._autofillSession)) return { ...target, verified: false, reason: 'lead_confirmed_paused' };
  const readiness = await field.evaluate(inspectInteractionReadiness, null).catch(() => ({ ready: false }));
  if (!readiness.ready) return { ...target, verified: false, reason: 'select_unavailable' };
  // Đóng popup native trước khi chọn qua CDP để menu không giữ input của ô tiếp theo.
  await page?.keyboard?.press('Escape').catch(() => {});
  if (shouldStopAfterLead(page?._autofillSession)) return { ...target, verified: false, reason: 'lead_confirmed_paused' };
  // selectOption phát đúng một cặp input/change. Không gửi phím qua các đáp án trung gian.
  await field.selectOption({ value: target.value }, { timeout: 2000 }).catch(() => {});
  try {
    const value = await field.inputValue();
    return { ...target, verified: value === target.value, reason: value === target.value ? 'option_verified_hybrid' : 'value_not_retained' };
  } catch {
    const connected = await field.evaluate(element => element.isConnected).catch(() => false);
    return { ...target, verified: false, reason: connected ? 'value_not_retained' : 'navigated' };
  }
}
