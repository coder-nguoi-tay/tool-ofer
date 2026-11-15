import { isFinancialhelpPathThankyouUrl } from '../../leads/actions/is-financialhelp-path-thankyou-url.mjs';
import { shouldStopAfterLead } from '../should-stop-after-lead.mjs';
import { humanClick } from '../human-click.mjs';
import { addActionCount } from '../add-action-count.mjs';

/** Chờ trang chuyển sau khi bấm; quá hạn mà vẫn đứng ở paththankyou thì bấm lại. */
const RETRY_AFTER_MS = 5000;

/**
 * Tới https://blog.financialhelpfinder.com/paththankyou.php thì bấm đúng nút "Return to Financial Help Finder"
 * (`.thankyou-actions a.thankyou-button`) để sang financialhelpfinder.com và chạy chuỗi khảo sát kế tiếp.
 * Bấm theo selector cố định thay vì bộ tìm nút submit chung: bộ chung bỏ qua nút nằm sâu dưới trang
 * (màn điện thoại, trang dài) nên có phiên đứng lại ở trang này.
 *
 * @param {object} page Tab đang quét.
 * @param {object} [session={}] Phiên sở hữu tab (đếm thao tác, chính sách dừng sau lead).
 * @param {object} [options={}] autoSubmit, onLog.
 * @return {Promise<boolean>} True nếu tab đang ở paththankyou (đã xử lý, không chạy tiếp pipeline chung); false nếu là trang khác.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export async function clickPathThankyouButton(page, session = {}, options = {}) {
  if (!isFinancialhelpPathThankyouUrl(page.url())) return false;
  if (shouldStopAfterLead(session) || options.autoSubmit === false) return true;
  if (page._uxPathThankyouClickAt && Date.now() - page._uxPathThankyouClickAt < RETRY_AFTER_MS) return true;
  const button = page.locator('.thankyou-actions a.thankyou-button, a.thankyou-button').first();
  if (!await button.isVisible().catch(() => false)) return true; // trang chưa vẽ xong: lượt quét sau thử lại
  page._uxPathThankyouClickAt = Date.now();
  await button.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
  // Đánh dấu TRƯỚC khi bấm: sau click trang điều hướng ngay, đọc/ghi phần tử lúc đó sẽ treo lượt quét tới hết timeout.
  await button.evaluate(element => {
    element.dataset.uxSubmitted = '1';
    element.dataset.uxSubmitCount = String(Number(element.dataset.uxSubmitCount || 0) + 1);
  }, undefined, { timeout: 1000 }).catch(() => {});
  let clicked = await humanClick(page, button).catch(() => false);
  if (!clicked) clicked = await button.click({ timeout: 2000 }).then(() => true).catch(() => false);
  if (!clicked) {
    page._uxPathThankyouClickAt = 0;
    options.onLog?.({ type: 'paththankyou_button_failed', detail: 'Chưa bấm được nút "Return to Financial Help Finder" ở paththankyou; sẽ thử lại.' }, page);
    return true;
  }
  addActionCount(session, 1);
  session.lastActionTime = Date.now();
  options.onLog?.({ type: 'paththankyou_button_clicked', detail: 'Đã bấm "Return to Financial Help Finder" ở paththankyou để sang financialhelpfinder.com.' }, page);
  return true;
}
