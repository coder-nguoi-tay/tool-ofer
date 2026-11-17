// Bản giải riêng của offer 2615, chép từ src/autofill/adsmith/inspect-frame-loading.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
import { readEvidenceWithTimeout } from '../../../../../logging/recorder/read-evidence-with-timeout.mjs';

/**
 * Phân biệt AS_IFRAME chưa tạo, trắng, lỗi mạng và nội dung hợp lệ trên FinancialHelpFinder.
 * @param {object} page Trang cha chứa placement Adsmith cần quan sát.
 * @return {Promise<object>} state và lý do; unavailable không phải bằng chứng frame chết.
 * @throws {never} DOM đang chuyển hướng hoặc renderer chưa trả lời được giữ là chưa xác định.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export async function inspectAdsmithFrameLoading(page) {
  let element;
  let applicable = false;
  try {
    const parentUrl = new URL(page.url());
    if (!/^https?:$/.test(parentUrl.protocol) || !['financialhelpfinder.com', 'www.financialhelpfinder.com', 'blog.financialhelpfinder.com'].includes(parentUrl.hostname)) return { state: 'not_applicable' };
    const parent = await readEvidenceWithTimeout(page, 'adsmith-loading-parent', () => page.evaluate(() => {
      /**
       * Kiểm tra vùng placement và công việc ở trang cha qua toàn bộ tổ tiên.
       * @param {Element|null} element Vùng hoặc control cần kiểm tra.
       * @return {boolean} True khi có vùng hiển thị.
       * @author ductv <ductv@getflycrm.com>
       * @since 2026-11-15
       */
      const visible = element => {
        if (!element) return false;
        for (let node = element; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (node.hidden || node.hasAttribute('inert') || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        }
        return element.getClientRects().length > 0;
      };
      const container = document.querySelector('#AS_SURVEY');
      if (!visible(container)) return { applicable: false };
      const otherWork = Array.from(document.querySelectorAll('input:not([type="hidden"]),select,textarea,button,a.thankyou-button')).some(control => !container.contains(control)
        && !control.closest('header,footer,nav,aside,.sidebar,.ow-attribution') && !control.disabled && visible(control));
      if (otherWork) return { applicable: false };
      const iframe = container.querySelector('iframe#AS_IFRAME');
      const spinner = !iframe && [container, ...container.querySelectorAll('img,div,span')].some(node => visible(node)
        && /load-spin-02\.svg/i.test((node.getAttribute('src') || '') + ' ' + getComputedStyle(node).backgroundImage));
      return { applicable: true, iframe: Boolean(iframe), source: iframe?.getAttribute('src') || '', spinner, documentId: performance.timeOrigin };
    }));
    if (!parent?.applicable) return { state: 'not_applicable' };
    applicable = true;
    if (!parent.iframe) return parent.spinner ? { state: 'spinner_stuck', documentId: parent.documentId, reason: 'Đang chờ trang cha tạo iframe khảo sát.' } : { state: 'unavailable', applicable: true };
    if (parent.source && parent.source !== 'about:blank') {
      const source = new URL(parent.source, page.url());
      if (!/^https?:$/.test(source.protocol) || !['adsmith.io', 'www.adsmith.io'].includes(source.hostname) || !/^\/forge\//.test(source.pathname)) return { state: 'not_applicable' };
    }
    element = await page.locator('#AS_SURVEY iframe#AS_IFRAME').elementHandle({ timeout: 1000 });
    if (!element || !await element.isVisible()) return { state: 'not_applicable' };
    const frame = await element.contentFrame();
    if (!frame) return { state: 'frame_blank', documentId: parent.documentId, reason: 'Iframe khảo sát chưa có document.' };
    if (/^(chrome-error:|about:neterror)/i.test(frame.url())) return { state: 'chrome_error', documentId: parent.documentId, reason: 'Iframe khảo sát báo lỗi mạng của trình duyệt.' };
    const content = await readEvidenceWithTimeout(frame, 'adsmith-loading-document', () => frame.evaluate(() => {
      /**
       * Chỉ nhận nội dung khảo sát không nằm trong bước ẩn.
       * @param {Element} element Control, câu hỏi hoặc ảnh cần kiểm tra.
       * @return {boolean} True khi phần tử và tổ tiên hiển thị.
       * @author ductv <ductv@getflycrm.com>
       * @since 2026-11-15
       */
      const visible = element => {
        for (let node = element; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (node.hidden || node.hasAttribute('inert') || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        }
        return element.getClientRects().length > 0;
      };
      const controls = Array.from(document.querySelectorAll('.Qst,input:not([type="hidden"]),select,textarea,button,a[href],[role="button"]'));
      const hasWork = controls.some(control => visible(control) && (control.matches('input,select,textarea,button,a,[role="button"]') || control.textContent.trim()));
      const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
      const hasContent = Boolean(text && !/^(loading(?:\s+(?:survey|questions|content))?|please wait|đang tải)[\s.!…]*$/i.test(text));
      const hasImage = Array.from(document.images).some(image => image.complete && image.naturalWidth > 32 && image.getBoundingClientRect().height > 32 && visible(image)
        && !/logo|loading|spinner|load-spin/i.test(`${image.id} ${image.className} ${image.alt} ${image.getAttribute('src') || ''}`));
      return { hasWork, hasContent, hasImage };
    }));
    return content.hasWork || content.hasContent || content.hasImage ? { state: 'normal' } : { state: 'frame_blank', documentId: parent.documentId, reason: 'Document khảo sát chưa có nội dung hiển thị.' };
  } catch { return { state: 'unavailable', applicable }; }
  finally { await element?.dispose().catch(() => {}); }
}
