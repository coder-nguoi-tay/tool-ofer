import { hasPendingFrameRequests, lastFrameRequestSettledAt } from '../../browser/frames/pending-frame-requests.mjs';

/**
 * Lấy mốc dữ liệu mới có thể thay đổi iframe, từ tài liệu cha hoặc chính tài liệu con.
 * @param {object} page Tab sở hữu iframe.
 * @param {object} [frame] Frame đã tạo, nếu có.
 * @return {number} Thời điểm hoàn tất request gần nhất hoặc 0 nếu chưa ghi nhận.
 * @throws {never} Frame chưa tạo vẫn dùng được mốc của trang cha.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export function lastIframeContentRequestSettledAt(page, frame) {
  return Math.max(lastFrameRequestSettledAt(page, page.mainFrame?.()), lastFrameRequestSettledAt(page, frame));
}

/**
 * Đọc trạng thái tài liệu con; khi được yêu cầu chỉ tải lại trong chính tài liệu vẫn trống.
 * Hàm chạy trong renderer để bước xác minh cuối và yêu cầu điều hướng nằm trong cùng lượt JavaScript.
 * @param {object} [expected] URL, timeOrigin và nguồn thẻ nhúng ở lần quan sát trước.
 * @return {object|boolean} Dấu hiệu nhận diện và nội dung, hoặc kết quả yêu cầu tải lại.
 * @throws {Error} Khi tài liệu bị thay thế trong lúc evaluate.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export function inspectBlankFrameDocument(expected) {
  const childUrl = location.href;
  const childDocumentId = performance.timeOrigin;
  if (expected && (childUrl !== expected.childUrl || childDocumentId !== expected.childDocumentId)) return false;
  const ipBar = document.getElementById('__autolead_ip_bar');
  const text = (document.body?.innerText || '').replace(ipBar?.innerText || '\u0000', '').trim();
  const controls = document.querySelector('input:not([type="hidden"]),select,textarea,button,a[href],[role="button"],[contenteditable]:not([contenteditable="false"]),canvas,video,iframe');
  const hasImage = Array.from(document.images).some(image => image.naturalWidth > 32 && image.getBoundingClientRect().height > 32);
  const blank = !text && !controls && !hasImage;
  if (!expected) return { childUrl, childDocumentId, blank };
  if (!blank || document.readyState !== 'complete') return false;
  const owner = window.frameElement;
  if (owner) {
    if (!owner.isConnected || window.parent.performance.timeOrigin !== expected.documentId ||
        owner.hasAttribute('srcdoc') || owner.getAttribute('src') !== expected.source) return false;
    owner.setAttribute('src', expected.source);
  } else {
    // Với frame khác origin, chỉ điều hướng GET ngay trong tài liệu đã xác minh.
    if (!/^https?:/.test(childUrl) || childUrl !== expected.absoluteSource) return false;
    location.replace(childUrl);
  }
  return true;
}

/**
 * Kiểm tra thẻ nhúng và tài liệu con. Giữ nguyên iframe nếu tab bước vào xác minh thủ công.
 * @param {object} page Tab chứa iframe.
 * @param {object|null} frame Tài liệu đích.
 * @param {object} observation Nguồn thẻ, mã tài liệu cha, URL và mã tài liệu con đã quan sát.
 * @param {number} settledAt Mốc mạng tại lần quan sát.
 * @return {Promise<boolean>} True khi đã yêu cầu tải lại tài liệu còn trống.
 * @throws {never} Giữ nguyên frame khi việc xác minh không hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function reloadObservedIframe(page, frame, observation, settledAt) {
  const { source, documentId, childUrl, childDocumentId } = observation;
  if (page._manualCaptchaPending || !frame || !source || source === 'about:blank' || !childUrl || childDocumentId == null || hasPendingFrameRequests(page, frame)) return false;
  let owner;
  try {
    owner = await frame.frameElement();
    const absoluteSource = await owner.evaluate((iframe, expected) =>
      iframe.isConnected && performance.timeOrigin === expected.documentId && !iframe.hasAttribute('srcdoc') &&
      iframe.getAttribute('src') === expected.source ? iframe.src : null, { source, documentId });
    if (page._manualCaptchaPending || !absoluteSource || hasPendingFrameRequests(page, frame) || hasPendingFrameRequests(page, page.mainFrame?.()) ||
      lastIframeContentRequestSettledAt(page, frame) !== settledAt) return false;
    return await frame.evaluate(inspectBlankFrameDocument, { source, documentId, absoluteSource, childUrl, childDocumentId }) === true;
  } catch { return false; }
  finally { await owner?.dispose().catch(() => {}); }
}
