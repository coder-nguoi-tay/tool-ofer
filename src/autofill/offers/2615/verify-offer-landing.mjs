import { isOffer2615Configured } from './match-offer.mjs';
import { protectConfirmedLeadSession } from '../../../leads/actions/protect-confirmed-lead-session.mjs';
import { isToffersDuplicateOfferUrl } from '../../../leads/actions/is-toffers-duplicate-offer-url.mjs';
import { autoRefill } from '../../../runtime/constants/auto-refill.mjs';
import { queueAutomaticRefill } from '../../../refill/actions/queue-automatic-refill.mjs';

/**
 * Kiểm tra xem URL có thuộc domain blog.financialhelpfinder.com hay không.
 *
 * @param {string|object} url URL cần kiểm tra.
 * @return {boolean} True nếu đúng domain blog.financialhelpfinder.com.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
export function isBlogFinancialHelpFinderUrl(url) {
  if (!url) return false;
  try {
    const href = typeof url === 'string' ? url : url?.href || '';
    if (!href || href === 'about:blank' || href.startsWith('chrome:')) return false;
    const parsed = new URL(href);
    const hostname = (parsed.hostname || '').replace(/\.$/, '').toLowerCase();
    return hostname === 'blog.financialhelpfinder.com';
  } catch {
    return false;
  }
}

/**
 * Kiểm tra xem URL đích sau khi load link offer 2615 có đúng là blog.financialhelpfinder.com hay không.
 * Ban đầu mở link qua topoffer (toffers), trang topoffer tải xong sẽ chuyển hướng đến blog.financialhelpfinder.com
 * trong vòng vài giây. Hàm này chờ quá trình chuyển hướng hoàn tất (tối đa timeoutMs, mặc định 15s).
 * Nếu sau thời gian chờ mà URL mở ra vẫn không phải blog.financialhelpfinder.com thì tắt tất cả trình duyệt.
 *
 * @param {object} page Tab trình duyệt hoặc object có url().
 * @param {object} session Phiên hiện tại.
 * @param {object} [options={}] Cấu hình bổ sung ({ closeActiveBrowsers, landingTimeoutMs, onLog, ... }).
 * @return {Promise<boolean>} True khi tab đang chờ xác minh CAPTCHA hoặc đã xử lý landing sai.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function verifyOffer2615Landing(page, session = {}, options = {}) {
  // 1. Chỉ áp dụng cho phiên được cấu hình chạy Offer 2615
  if (!isOffer2615Configured(session)) {
    return false;
  }

  // 2. Nếu phiên này đã được xác nhận landing hợp lệ trước đó thì không cần kiểm tra lại
  if (session._offer2615LandingVerified) {
    return false;
  }

  // 3. Nếu đã kích hoạt đóng tất cả hoặc phiên đã có lead được bảo vệ thì không xử lý lại
  if (session._offer2615InvalidLandingTriggered || protectConfirmedLeadSession(session)) {
    return false;
  }

  // Tránh chạy nhiều lượt kiểm tra đồng thời trên cùng một session
  if (session._offer2615LandingCheckPromise) {
    return session._offer2615LandingCheckPromise;
  }

  const checkTask = (async () => {
    const getUrl = () => {
      try {
        return typeof page?.url === 'function' ? page.url() : (typeof page === 'string' ? page : '');
      } catch {
        return '';
      }
    };

    let currentUrl = getUrl();

    // 4. Nếu URL hiện tại đã là blog.financialhelpfinder.com thì xác thực ngay lập tức
    if (isBlogFinancialHelpFinderUrl(currentUrl)) {
      session._offer2615LandingVerified = true;
      return false;
    }

    // 5. Chờ topoffer tải xong và chuyển hướng đến blog.financialhelpfinder.com (trong vòng vài giây)
    const timeoutMs = Number(options.landingTimeoutMs ?? 15000);

    if (typeof page?.waitForURL === 'function') {
      try {
        await page.waitForURL(url => {
          const href = typeof url === 'string' ? url : url?.href || '';
          // Nếu gặp lỗi Toffers đã click offer, dừng chờ sớm để không mất thời gian vô ích
          if (isToffersDuplicateOfferUrl(href)) return true;
          return isBlogFinancialHelpFinderUrl(url);
        }, { timeout: timeoutMs, waitUntil: 'domcontentloaded' });
      } catch {
        // Hết thời gian chờ chuyển hướng
      }
      currentUrl = getUrl();
    } else {
      // Dành cho môi trường mock test không có page.waitForURL
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        currentUrl = getUrl();
        if (isBlogFinancialHelpFinderUrl(currentUrl) || isToffersDuplicateOfferUrl(currentUrl)) {
          break;
        }
        await new Promise(r => setTimeout(r, 50));
      }
    }

    // 6. Kiểm tra lại sau khi chờ: nếu đúng là blog.financialhelpfinder.com
    if (isBlogFinancialHelpFinderUrl(currentUrl)) {
      session._offer2615LandingVerified = true;
      console.log(`[Offer2615] Đã chuyển hướng thành công đến blog.financialhelpfinder.com (${currentUrl}) sau khi qua topoffer.`);
      return false;
    }

    // Widget có thể xuất hiện trong lúc chờ redirect. Giữ nguyên lượt kiểm tra cho sau khi xác minh.
    if (page?._manualCaptchaPending) return true;
    // 7. KHÔNG PHẢI blog.financialhelpfinder.com sau khi tải topoffer -> DỪNG PHIÊN VÀ BÙ PHIÊN MỚI!
    session._offer2615InvalidLandingTriggered = true;
    const detail = `Link offer 2615 mở ra không phải blog.financialhelpfinder.com sau khi tải topoffer (URL hiện tại: ${currentUrl || 'không rõ'}). Dừng phiên và bù phiên mới.`;
    console.warn(`[Offer2615] ${detail}`);

    session?.addBrowserLog?.({
      type: 'offer_2615_invalid_landing',
      detail
    }, page);

    options?.onLog?.({
      type: 'offer_2615_invalid_landing',
      detail
    }, page);

    // Dừng phiên hiện tại
    session.isClosed = true;
    session.suppressAutoRefill = false; // Cho phép tự bù phiên mới

    // Đóng tab/browser của riêng phiên này (không tắt toàn bộ app)
    try {
      if (typeof options.closeSession === 'function') {
        await options.closeSession(session, page);
      } else if (typeof session._stopProfile === 'function') {
        await session._stopProfile();
      } else {
        await page?.close?.().catch(() => {});
        if (session.browser && typeof session.browser.close === 'function') {
          await session.browser.close().catch(() => {});
        }
      }
    } catch (err) {
      console.error('[Offer2615] Lỗi khi dừng phiên:', err.message);
    }

    // Kích hoạt bù phiên mới
    const refillFn = options.queueAutomaticRefill || queueAutomaticRefill;
    if (autoRefill.enabled && !autoRefill.stopRequested) {
      refillFn(2000);
    }

    return true;
  })();

  session._offer2615LandingCheckPromise = checkTask;
  try {
    return await checkTask;
  } finally {
    session._offer2615LandingCheckPromise = null;
  }
}
