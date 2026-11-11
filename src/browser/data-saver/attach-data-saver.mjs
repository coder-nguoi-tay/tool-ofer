import { isEssentialOfferUrl } from './is-essential-offer-url.mjs';
import { isHeavyAdOrTrackerUrl } from './is-heavy-ad-or-tracker-url.mjs';
import { isImageUrl } from './is-image-url.mjs';
import { isMediaUrl } from './is-media-url.mjs';
import { isNonessentialBackgroundUrl } from './is-nonessential-background-url.mjs';

/**
 * Gắn bộ lọc Data Saver để tiết kiệm băng thông proxy cho phiên duyệt web.
 * NGUYÊN TẮC BẢO TOÀN TRẢI NGHIỆM & LEAD (CỐT LÕI):
 * 1. TUYỆT ĐỐI KHÔNG CHẶN ẢNH (image): Logo câu hỏi, Captcha, hình ảnh khảo sát luôn hiển thị 100%.
 * 2. Giữ JavaScript/API của form, tài liệu, iframe và CSS:
 *    - Chỉ chặn script/API bên thứ ba của dịch vụ video quảng cáo và ghi lại phiên đã biết.
 *    - Không chặn XHR/Fetch gọi API câu hỏi & nộp đáp án.
 * 3. CHẶN TRIỆT ĐỂ MEDIA (video / audio / m3u8 / ts / m4s / webm streaming):
 *    - Chặn thêm engine tải video và upload ghi phiên, không chỉ dựa vào đuôi file media.
 *
 * @param {object} context BrowserContext của Playwright.
 * @param {object} session Phiên duyệt web.
 * @return {Promise<void>} Hoàn tất đăng ký bộ lọc tài nguyên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function attachDataSaver(context, session) {
  if (!context || !session) return;
  if (session._dataSaverAttached) return;
  session._dataSaverAttached = true;
  try {
    await context.route('**/*', async route => {
      try {
        const req = route.request();
        const type = req.resourceType();
        const url = req.url() || '';
        if (isEssentialOfferUrl(url)) return route.continue().catch(() => {});

        // 1. TUYỆT ĐỐI KHÔNG CHẶN ẢNH (Ảnh logo câu hỏi, Captcha, minh hoạ...)
        if (type === 'image' || isImageUrl(url)) {
          return route.continue().catch(() => {});
        }

        // Chặn nguồn nền trước nhánh cho qua script/API; giữ document và ảnh của mọi host.
        if (['script', 'xhr', 'fetch', 'other'].includes(type)) {
          let pageUrl = '';
          try { pageUrl = req.frame?.()?.page?.()?.url?.() || session.mainPage?.url?.() || ''; } catch {}
          if (isNonessentialBackgroundUrl(url, pageUrl)) {
            session.blockedAdsCount = (session.blockedAdsCount || 0) + 1;
            return route.abort('blockedbyclient').catch(() => {});
          }
        }

        // 2. Giữ JavaScript câu hỏi, tài liệu, iframe và stylesheet ngoài nhóm nền đã biết.
        // Bảo đảm 100% JavaScript câu hỏi, các lựa chọn trả lời và cấu trúc trang web hoạt động hoàn hảo
        if (type === 'script' || type === 'document' || type === 'subdocument' || type === 'stylesheet' || type === 'font') {
          return route.continue().catch(() => {});
        }

        // 4. CHẶN TRIỆT ĐỂ MEDIA (video / audio / m3u8 / ts streaming)
        // Áp dụng cho cả thẻ <video>/<audio> lẫn các chunk video stream được kéo bằng fetch/xhr
        if (type === 'media' || isMediaUrl(url)) {
          session.blockedMediaCount = (session.blockedMediaCount || 0) + 1;
          return route.abort('blockedbyclient').catch(() => {});
        }

        // 5. KHÔNG CHẶN XHR / FETCH (API câu hỏi, submit form, lead verification)
        // Trừ các file video chunk đã bị lọc ở bước 4 ở trên
        if (type === 'xhr' || type === 'fetch') {
          return route.continue().catch(() => {});
        }

        // 6. Chặn các kết nối rác bên thứ 3 còn lại (session replay streaming, socket ngầm)
        // Không ảnh hưởng tới script, API hay hình ảnh vì đã được cho qua ở các bước trên
        if (isHeavyAdOrTrackerUrl(url)) {
          session.blockedAdsCount = (session.blockedAdsCount || 0) + 1;
          return route.abort('blockedbyclient').catch(() => {});
        }
        return route.continue().catch(() => {});
      } catch {
        return route.continue().catch(() => {});
      }
    });
    session.addBrowserLog?.({
      type: 'data_saver_active',
      detail: 'Data Saver: chặn media, nguồn video quảng cáo và ghi phiên bên thứ ba; giữ ảnh, captcha, tài liệu và API form.'
    });
    console.log(`[DataSaver] Slot ${session.slot || '?'}: Đã lọc media và dịch vụ nền bên thứ ba.`);
  } catch (err) {
    session._dataSaverAttached = false;
    console.warn(`[DataSaver] Slot ${session.slot || '?'}: Lỗi gắn route:`, err.message);
  }
}
export { attachDataSaver };
