import { readEvidenceWithTimeout } from '../../logging/recorder/read-evidence-with-timeout.mjs';

const activeChallengeFrames = new WeakSet();

/**
 * Nhận diện giao diện xác minh đang hiển thị hoặc kiểm tra iframe chứa giao diện đó.
 * Callback này chạy trực tiếp trong từng document của trình duyệt.
 * @param {Element} [owner] Thẻ iframe trong document cha nếu đang kiểm tra vùng chứa.
 * @return {boolean} Có widget đang hiển thị, hoặc thẻ iframe được truyền vào đang hiển thị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function inspectManualCaptchaSurface(owner) {
  const candidates = owner ? [owner] : document.querySelectorAll([
    '.y-captcha[data-ycaptcha-initialized="true"] .ycaptcha-captcha-area :is([role="slider"]:not([aria-disabled="true"]),[role="grid"],button img)',
    '#rc-imageselect-target',
    '#recaptcha-anchor[role="checkbox"][aria-checked="false"]',
    'iframe[src*="/recaptcha/api2/bframe"]',
    'iframe[src*="/recaptcha/enterprise/bframe"]',
    'iframe[src*="hcaptcha.com/"][src*="frame=challenge"]',
  ].join(','));
  for (const candidate of candidates) {
    const bounds = candidate.getBoundingClientRect();
    if (bounds.width <= 1 || bounds.height <= 1) continue;
    if (bounds.right + scrollX <= 0 || bounds.bottom + scrollY <= 0) continue;
    if (candidate.closest('[hidden],[inert],[aria-hidden="true"]')) continue;
    let visible = true;
    for (let ancestor = candidate; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' ||
          style.opacity === '0' || style.contentVisibility === 'hidden') {
        visible = false;
        break;
      }
    }
    if (visible) return true;
  }
  return false;
}

/**
 * Kiểm tra document con sau khi xác nhận các iframe tổ tiên vẫn hiển thị.
 * @param {object} frame Frame con gắn với trang được kiểm tra.
 * @return {Promise<boolean>} Có CAPTCHA đang hiển thị trong frame này.
 * @throws {Error} Khi frame vừa đổi document hoặc không phản hồi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
async function inspectChildFrameCaptcha(frame) {
  for (let child = frame; child.parentFrame(); child = child.parentFrame()) {
    const owner = await child.frameElement();
    try { if (!await owner.evaluate(inspectManualCaptchaSurface)) return false; }
    finally { await owner.dispose(); }
  }
  return !frame.isDetached() && await frame.evaluate(inspectManualCaptchaSurface);
}

/**
 * Xác định tab cần nhường cho người dùng xác minh, kể cả widget trong iframe khác origin.
 * @param {object} page Tab Playwright cần kiểm tra trước khi autofill.
 * @return {Promise<boolean>} Có CAPTCHA cần xác minh trong vùng hiển thị của tab.
 * @throws {Error} Khi trang chính hoặc frame đã phát hiện CAPTCHA chưa phản hồi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function inspectPageManualCaptcha(page) {
  if (await readEvidenceWithTimeout(page, 'manual-captcha', () => page.evaluate(inspectManualCaptchaSurface))) return true;
  const frames = page.frames().filter(frame => frame.parentFrame());
  const results = await Promise.allSettled(frames.map(frame =>
    readEvidenceWithTimeout(frame, 'manual-captcha', () => inspectChildFrameCaptcha(frame))));
  let pendingError;
  let hasChallenge = false;
  for (const [index, result] of results.entries()) {
    const frame = frames[index];
    if (frame.isDetached()) continue;
    if (result.status === 'rejected') {
      if (activeChallengeFrames.has(frame)) pendingError = result.reason;
    } else if (result.value) {
      activeChallengeFrames.add(frame);
      hasChallenge = true;
    } else {
      activeChallengeFrames.delete(frame);
    }
  }
  if (hasChallenge) return true;
  if (pendingError) throw pendingError;
  return false;
}
