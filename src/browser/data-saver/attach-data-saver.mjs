import { isEssentialOfferUrl } from './is-essential-offer-url.mjs';
import { isHeavyAdOrTrackerUrl } from './is-heavy-ad-or-tracker-url.mjs';
import { isImageUrl } from './is-image-url.mjs';
import { isMediaUrl } from './is-media-url.mjs';
import { isNonessentialBackgroundUrl } from './is-nonessential-background-url.mjs';
import { isNonessentialImageUrl } from './is-nonessential-image-url.mjs';

/**
 * Gắn bộ lọc Data Saver để tiết kiệm băng thông proxy và giảm tải CPU/RAM cho phiên duyệt web.
 * NGUYÊN TẮC BẢO TOÀN TRẢI NGHIỆM & LEAD (CỐT LÕI):
 * 1. BẢO TỒN 100% ẢNH CẦN THIẾT: Logo câu hỏi, Captcha, hình ảnh khảo sát luôn hiển thị.
 *    - Chỉ chặn ảnh quảng cáo rác, tracking pixel 1x1 và banner nặng bên thứ ba.
 * 2. Giữ JavaScript/API của form, tài liệu, iframe và CSS:
 *    - Chỉ chặn script/API bên thứ ba của dịch vụ video quảng cáo và ghi lại phiên đã biết.
 *    - Không chặn XHR/Fetch gọi API câu hỏi & nộp đáp án.
 * 3. CHẶN TRIỆT ĐỂ MEDIA (video / audio / m3u8 / ts / m4s / webm streaming).
 * 4. TRIỆT TIÊU ANIMATION CSS VÔ ÍCH: Đưa animation về 0.001ms để GPU/CPU không render 60fps ngầm.
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
    await context.emulateMedia?.({ reducedMotion: 'reduce' }).catch(() => {});
    await context.addInitScript?.(() => {
      try {
        if (/(?:cloudflare|turnstile|recaptcha|hcaptcha|arkose|geetest)/i.test(window.location.hostname)) return;
        const style = document.createElement('style');
        style.id = '__autolead_perf_style';
        style.textContent = `
          *, *::before, *::after {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.001ms !important;
            scroll-behavior: auto !important;
          }
        `;
        const inject = () => {
          const root = document.head || document.documentElement;
          if (root && !document.getElementById('__autolead_perf_style')) {
            root.appendChild(style);
          }
        };
        inject();
        if (!document.getElementById('__autolead_perf_style')) {
          document.addEventListener('DOMContentLoaded', inject, { once: true });
        }
      } catch {}
    }).catch(() => {});

    await context.route('**/*', async route => {
      try {
        const req = route.request();
        const type = req.resourceType();
        const url = req.url() || '';
        if (isEssentialOfferUrl(url)) return route.continue().catch(() => {});

        // 1. Lọc ảnh: bảo vệ ảnh câu hỏi, Captcha, logo; chỉ chặn ảnh pixel/banner quảng cáo rác bên thứ 3
        if (type === 'image' || isImageUrl(url)) {
          let pageUrl = '';
          try { pageUrl = req.frame?.()?.page?.()?.url?.() || session.mainPage?.url?.() || ''; } catch {}
          if (isNonessentialImageUrl(url, pageUrl)) {
            session.blockedAdsCount = (session.blockedAdsCount || 0) + 1;
            return route.abort('blockedbyclient').catch(() => {});
          }
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
