import { isToffersDuplicateOfferUrl } from "../actions/is-toffers-duplicate-offer-url.mjs";

const pendingFrameEvaluations = new WeakSet();

/**
 * Nhận diện lỗi mạng, trang blocked và duplicate IP trên tab và các frame con.
 *
 * @param {object} page Tab của Playwright hoặc Puppeteer.
 * @return {Promise<string|null>} Lý do lỗi đã xác nhận hoặc null nếu chưa thấy lỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function getDeadOrBlockedReason(page) {
  try {
    if (!page || typeof page.isClosed === 'function' && page.isClosed()) return null;
    const currentUrl = typeof page.url === 'function' ? page.url() : page.url || '';
    if (typeof currentUrl === 'string') {
      if (currentUrl.startsWith('chrome-error://') || currentUrl.startsWith('about:neterror')) {
        return 'Lỗi mạng trình duyệt (chrome-error)';
      }
      if (isToffersDuplicateOfferUrl(currentUrl)) {
        return 'IP đã click offer trước đó (Toffers Duplicate IP)';
      }
    }
    const checkFrame = async frame => {
      try {
        if (!frame) return null;
        const frameUrl = typeof frame.url === 'function' ? frame.url() : frame.url || '';
        if (typeof frameUrl === 'string') {
          if (frameUrl.startsWith('chrome-error://') || frameUrl.startsWith('about:neterror')) {
            let frameErr = '';
            try {
              frameErr = typeof frame.evaluate === 'function' ? await frame.evaluate(() => {
                const el = document.getElementById('sub-frame-error-details') || document.getElementById('main-frame-error-details') || document.getElementById('sub-frame-error') || document.getElementById('main-frame-error');
                return el ? (el.innerText || el.textContent || '').trim() : '';
              }) : '';
            } catch {}
            return frameErr ? `Lỗi kết nối (${frameErr})` : 'Lỗi mạng trình duyệt (chrome-error)';
          }
          if (isToffersDuplicateOfferUrl(frameUrl)) {
            return 'IP đã click offer trước đó (Toffers Duplicate IP)';
          }
        }
        if (typeof frame.evaluate !== 'function' || pendingFrameEvaluations.has(frame)) return null;
        pendingFrameEvaluations.add(frame);
        const evaluatePromise = Promise.resolve().then(() => frame.evaluate(() => {
          const winUrl = typeof window !== 'undefined' && window.location?.href || '';
          if (winUrl && (/toffers\.top\/error\.php/i.test(winUrl) || /error\.php\?error=ip_/i.test(winUrl) || /clicked_offer_/i.test(winUrl))) {
            return 'IP đã click offer trước đó (Toffers Duplicate IP)';
          }

          // 1. Kiểm tra phần tử sub-frame-error hoặc main-frame-error chuẩn của Chromium
          const subFrameError = typeof document !== 'undefined' && (document.getElementById('sub-frame-error') || document.getElementById('main-frame-error') || document.querySelector?.('#sub-frame-error, #main-frame-error, #sub-frame-error-details, #main-frame-error-details'));
          if (subFrameError) {
            const details = document.getElementById('sub-frame-error-details') || document.getElementById('main-frame-error-details') || subFrameError;
            const errText = (details.innerText || details.textContent || '').trim();
            return errText ? `ERR_CONNECTION_REFUSED: ${errText}` : 'ERR_CONNECTION_REFUSED';
          }
          const title = typeof document !== 'undefined' && document.title || '';
          const bodyText = typeof document !== 'undefined' && document.body ? document.body.innerText || document.body.textContent || '' : '';
          const docText = !bodyText && typeof document !== 'undefined' && document.documentElement ? document.documentElement.innerText || document.documentElement.textContent || '' : '';
          const fullText = `${title} ${bodyText || docText}`;
          if (/clicked_offer_|already clicked offer|ip_[\d\.]+_clicked_offer/i.test(fullText)) {
            return 'IP đã click offer trước đó (Toffers Duplicate IP)';
          }
          if (/traffic\s+blocked/i.test(fullText)) {
            return 'Traffic Blocked!';
          }
          if (/refused to connect|từ chối kết nối|bị từ chối kết nối/i.test(fullText)) {
            return 'ERR_CONNECTION_REFUSED';
          }
          const netErrorMatch = fullText.match(/\b(ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_PROXY_CONNECTION_FAILED|ERR_SOCKS_CONNECTION_FAILED|ERR_TUNNEL_CONNECTION_FAILED|ERR_TIMED_OUT|ERR_CONNECTION_TIMED_OUT|ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|ERR_NAME_NOT_RESOLVED|DNS_PROBE_FINISHED_NXDOMAIN|ERR_INTERNET_DISCONNECTED|ERR_ADDRESS_UNREACHABLE|ERR_SSL_PROTOCOL_ERROR|ERR_NETWORK_CHANGED|ERR_BLOCKED_BY_CLIENT|ERR_FAILED)\b/i);
          if (netErrorMatch) {
            return netErrorMatch[1].toUpperCase();
          }
          if (/this site can[’']t be reached|không thể truy cập trang web này/i.test(fullText)) {
            return 'This site can’t be reached';
          }
          if (/unexpectedly closed the connection|đã bất ngờ đóng kết nối/i.test(fullText)) {
            return 'ERR_CONNECTION_CLOSED';
          }
          if (/checking the proxy and the firewall|kiểm tra proxy và tường lửa/i.test(fullText)) {
            return 'Lỗi kết nối proxy';
          }

          // Kiểm tra xem có bất kỳ iframe con nào trong DOM có sub-frame-error không
          try {
            if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
              const iframes = document.querySelectorAll('iframe');
              for (const ifr of iframes) {
                try {
                  const idoc = ifr.contentDocument || ifr.contentWindow?.document;
                  if (idoc) {
                    const sub = idoc.getElementById('sub-frame-error') || idoc.querySelector?.('#sub-frame-error, #sub-frame-error-details');
                    if (sub) {
                      const txt = (sub.innerText || sub.textContent || '').trim();
                      return txt ? `ERR_CONNECTION_REFUSED: ${txt}` : 'ERR_CONNECTION_REFUSED';
                    }
                    const ifrText = `${idoc.title || ''} ${idoc.body ? idoc.body.innerText || '' : ''}`;
                    if (/refused to connect|từ chối kết nối/i.test(ifrText)) {
                      return 'ERR_CONNECTION_REFUSED';
                    }
                  }
                } catch {}
              }
            }
          } catch {}
          return null;
        })).finally(() => pendingFrameEvaluations.delete(frame));
        let timeoutId;
        const timeoutPromise = new Promise(resolve => {
          timeoutId = setTimeout(() => resolve(null), 2000);
          timeoutId.unref?.();
        });
        const result = await Promise.race([evaluatePromise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
        if (typeof result === 'string' && result.trim()) return result.trim();
        if (result === true) return 'Traffic Blocked!';
        return null;
      } catch {
        return null;
      }
    };

    // 1. Kiểm tra trang chính
    let reason = await checkFrame(page);
    if (reason) return reason;

    // 2. Kiểm tra các frame/iframe con
    if (typeof page.frames === 'function') {
      try {
        const frames = page.frames();
        for (const frame of frames) {
          if (frame === page.mainFrame?.()) continue;
          reason = await checkFrame(frame);
          if (reason) return reason;
        }
      } catch {}
    }
    return null;
  } catch {
    return null;
  }
}
