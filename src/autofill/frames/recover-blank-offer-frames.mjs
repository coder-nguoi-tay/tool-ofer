import { readEvidenceWithTimeout } from '../../logging/recorder/read-evidence-with-timeout.mjs';
import { isHeavyAdOrTrackerUrl } from '../../browser/data-saver/is-heavy-ad-or-tracker-url.mjs';
import { hasPendingFrameRequests } from '../../browser/frames/pending-frame-requests.mjs';
import { inspectBlankFrameDocument, lastIframeContentRequestSettledAt, reloadObservedIframe } from './reload-observed-iframe.mjs';

// Iframe quảng cáo/đo lường không phải offer: không nạp lại dù trống.
const AD_FRAME_HOSTS = ['doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'google.com', 'facebook.com',
  'adnxs.com', 'criteo.com', 'taboola.com', 'outbrain.com', 'amazon-adsystem.com', 'youtube.com', 'googletagmanager.com'];
const BLANK_WAIT_MS = 6000;
const MAX_FRAME_RELOADS = 2;
const observations = new WeakMap();

/**
 * Ưu tiên hiện iframe offer (người dùng chốt 2026-11-18: iframe là phần quan trọng của offer).
 *
 * Trong một đợt iframe trống liên tục sau khi các request đã kết thúc, cho phép tối đa 2 lần nạp lại riêng iframe.
 * Khi chưa đọc được frame hoặc request vẫn đang chạy, chờ lượt quan sát mới.
 * Iframe Adsmith #AS_IFRAME do recoverAdsmithFrameLoading lo riêng; iframe quảng cáo/tracker và iframe nhỏ bị bỏ qua.
 * @param {object} page Tab Playwright.
 * @param {object} session Phiên trình duyệt (bỏ qua khi đã đóng).
 * @param {object} [options] onLog để ghi log phiên.
 * @param {number} [now] Đồng hồ cho test.
 * @return {Promise<boolean>} True nếu lượt này đã nạp lại ít nhất một iframe.
 * @throws {never} Bỏ qua frame vừa chuyển trang hoặc không xác định được.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export async function recoverBlankOfferFrames(page, session, options = {}, now = Date.now()) {
  if (session?.isClosed || page.isClosed?.() || ['manual', 'skip'].includes(session?.offerMode)) return false;
  let tab = observations.get(page);
  if (!tab) { tab = { frames: new Map(), pending: false }; observations.set(page, tab); }
  if (tab.pending) return false;
  tab.pending = true;
  try {
    const candidates = await readEvidenceWithTimeout(page, 'offer-frame-candidates', () => page.evaluate(() => {
      const visible = element => {
        for (let node = element; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (node.hidden || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width >= 280 && rect.height >= 200;
      };
      return Array.from(document.querySelectorAll('iframe')).map((frame, index) => ({ index, id: frame.id, source: frame.getAttribute('src') || '' }))
        .filter(item => item.id !== 'AS_IFRAME' && /^https?:/i.test(item.source) && visible(document.querySelectorAll('iframe')[item.index]))
        .map(item => ({ ...item, documentId: performance.timeOrigin }));
    })).catch(() => []);
    let reloaded = false;
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      let host = '';
      try { host = new URL(candidate.source, page.url()).hostname.toLowerCase(); } catch { continue; }
      if (isHeavyAdOrTrackerUrl(candidate.source) || AD_FRAME_HOSTS.some(ad => host === ad || host.endsWith(`.${ad}`))) continue;
      // Giữ số lượt cũ trong lúc chờ request, nhưng chỉ tính thời gian quan sát lại khi frame đã ổn định.
      const key = `${candidate.documentId}|${candidate.index}|${candidate.source}`;
      let state = tab.frames.get(key);
      const element = await page.locator('iframe').nth(candidate.index).elementHandle({ timeout: 1000 }).catch(() => null);
      const frame = await element?.contentFrame().catch(() => null);
      await element?.dispose().catch(() => {});
      if (!frame || hasPendingFrameRequests(page, frame) || hasPendingFrameRequests(page, page.mainFrame?.())) continue;
      const child = await readEvidenceWithTimeout(frame, 'offer-frame-content', () => frame.evaluate(inspectBlankFrameDocument)).catch(() => null);
      if (!child?.blank) { if (child) tab.frames.delete(key); continue; }
      const settledAt = lastIframeContentRequestSettledAt(page, frame);
      if (!state) { state = { reloads: 0 }; tab.frames.set(key, state); }
      if (state.since == null || state.settledAt !== settledAt || state.childUrl !== child.childUrl || state.childDocumentId !== child.childDocumentId) state.since = now;
      Object.assign(state, { settledAt, childUrl: child.childUrl, childDocumentId: child.childDocumentId });
      if (state.reloads >= MAX_FRAME_RELOADS || now - state.since < BLANK_WAIT_MS) continue;
      const done = await reloadObservedIframe(page, frame, { ...candidate, ...child }, settledAt);
      if (!done) continue;
      state.reloads++;
      reloaded = true;
      options.onLog?.({ type: 'offer_frame_reload', detail: `Iframe offer ${host} vẫn trống sau ${Math.round((now - state.since) / 1000)} giây; nạp lại riêng iframe, lần ${state.reloads}/${MAX_FRAME_RELOADS} (giữ trang cha).`, frameReloads: state.reloads }, page);
      state.since = now;
    }
    return reloaded;
  } catch {
    // Trang vừa điều hướng/đóng: watcher không được sập vì bước phụ này.
    return false;
  } finally { tab.pending = false; }
}
