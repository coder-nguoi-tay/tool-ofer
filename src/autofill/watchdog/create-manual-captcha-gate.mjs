import { randomUUID } from 'node:crypto';
import { stopContinuousAgent } from '../../continuous-agent/stop-continuous-agent.mjs';
import { inspectPageManualCaptcha } from './inspect-page-manual-captcha.mjs';

/**
 * Nhường một tab cho người dùng khi có CAPTCHA. Trang mới phải được kiểm tra lại;
 * trên cùng trang, chỉ người vận hành mới xác nhận đã hoàn tất.
 * @param {object} page Tab Playwright đang được watcher quản lý.
 * @param {Function} [onLog] Callback ghi sự kiện theo tab.
 * @return {Function} Hàm kiểm tra trả true khi cần hoãn tự điền.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function createManualCaptchaGate(page, onLog) {
  let heldUrl;
  let inspection;
  let inspectedUrl;
  let lastReadErrorLogAt = 0;

  /**
   * Dùng chung lượt đọc đang chạy để các sự kiện và nhịp quét cùng đợi một kết quả.
   * @return {Promise<boolean|null>} Có CAPTCHA hiển thị, hoặc null khi chưa thể kết luận.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-20
   */
  function inspect() {
    if (!inspection || page.url() !== inspectedUrl) {
      inspectedUrl = page.url();
      const current = inspectPageManualCaptcha(page).catch(() => {
        if (!page.isClosed() && Date.now() - lastReadErrorLogAt >= 60_000) {
          lastReadErrorLogAt = Date.now();
          onLog?.({ type: 'autofill_renderer_unresponsive', detail: 'Chưa đọc được giao diện để kiểm tra CAPTCHA. Tab sẽ được kiểm tra lại.' }, page);
        }
        return null;
      }).finally(() => {
        if (inspection === current) inspection = undefined;
      });
      inspection = current;
    }
    return inspection;
  }

  /**
   * Trả quyền thao tác cho watcher sau xác nhận hoặc chuyển bước đã được quan sát.
   * @return {void}
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-20
   */
  function release() {
    heldUrl = undefined;
    page._manualCaptchaPending = false;
    page._manualCaptchaRequestId = undefined;
    onLog?.({ type: 'manual_captcha_resumed', detail: 'Đã kết thúc chờ xác minh thủ công trên tab.' }, page);
  }

  /**
   * Xác nhận đúng lượt chờ sau khi người dùng hoàn tất xác minh trên cùng trang.
   * @param {string} requestId Mã lượt chờ mà Screen View đang hiển thị.
   * @return {Promise<boolean>} True nếu tab đã sẵn sàng quét lại.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-20
   */
  page.confirmManualCaptcha = async requestId => {
    if (!requestId || requestId !== page._manualCaptchaRequestId || page.isClosed()) return false;
    // Một lượt đọc bắt đầu trước khi người dùng bấm có thể thuộc DOM cũ.
    if (inspection) await inspection;
    const url = page.url();
    if (await inspect() !== false || requestId !== page._manualCaptchaRequestId || page.isClosed() || page.url() !== url) return false;
    release();
    page.triggerAutofillScan?.();
    return true;
  };

  /**
   * Cấp một mã mới khi gặp thử thách ở bước mới và dừng agent đang giữ tab.
   * @return {Promise<boolean>} True khi cần giữ các thao tác tự động lại.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-20
   */
  return async function shouldWaitForManualCaptcha() {
    const url = page.url();
    const stepUrl = url.split(/[?#]/)[0];
    const enteredNewStep = page._manualCaptchaPending && stepUrl !== heldUrl && /^https?:\/\//i.test(stepUrl);
    if (enteredNewStep) {
      try { await page.waitForLoadState('domcontentloaded', { timeout: 3000 }); }
      catch { return true; }
      if (page.isClosed() || page.url() !== url) return true;
    }
    const visible = await inspect();
    if (page.isClosed() || url !== page.url() || visible === null) return true;
    if (visible && (!page._manualCaptchaPending || stepUrl !== heldUrl)) {
      heldUrl = stepUrl;
      page._manualCaptchaPending = true;
      page._manualCaptchaRequestId = randomUUID();
      stopContinuousAgent(page, 'manual_captcha');
      onLog?.({ type: 'manual_captcha_required', detail: 'Chờ xác minh CAPTCHA thủ công trong Xem màn hình.' }, page);
    } else if (!visible && enteredNewStep && page._manualCaptchaPending && stepUrl !== heldUrl) {
      release();
    }
    return page._manualCaptchaPending === true;
  };
}
