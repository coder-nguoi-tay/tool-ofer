import { readEvidenceWithTimeout } from '../../logging/recorder/read-evidence-with-timeout.mjs';
import { isHeavyAdOrTrackerUrl } from '../../browser/data-saver/is-heavy-ad-or-tracker-url.mjs';

// Iframe quảng cáo/đo lường không phải offer: không nạp lại dù trống.
const AD_FRAME_HOSTS = ['doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'google.com', 'facebook.com',
  'adnxs.com', 'criteo.com', 'taboola.com', 'outbrain.com', 'amazon-adsystem.com', 'youtube.com', 'googletagmanager.com'];
const BLANK_WAIT_MS = 6000;
const MAX_FRAME_RELOADS = 2;
const observations = new WeakMap();

/**
 * Ưu tiên hiện iframe offer (người dùng chốt 2026-11-18: iframe là phần quan trọng của offer).
 *
 * Iframe offer cỡ lớn (khảo sát, offerwall, form đối tác) trống quá 6 giây thì nạp lại riêng iframe đó, tối đa 2 lần
 * mỗi document, không F5 trang cha. Trống nghĩa là: chưa có document/URL rỗng (request treo), about:blank dù có src
 * (Obscura khi nạp lỗi), chrome-error, hoặc document không có control/chữ/ảnh nào (thanh IP của AutoLeadPC không tính).
 * Iframe Adsmith #AS_IFRAME do recoverAdsmithFrameLoading lo riêng; iframe quảng cáo/tracker và iframe nhỏ bị bỏ qua.
 * @param {object} page Tab Playwright.
 * @param {object} session Phiên trình duyệt (bỏ qua khi đã đóng).
 * @param {object} [options] onLog để ghi log phiên.
 * @param {number} [now] Đồng hồ cho test.
 * @return {Promise<boolean>} True nếu lượt này đã nạp lại ít nhất một iframe.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
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
      // Khóa theo document trang cha: trang cha tải lại thì đếm lại; iframe tạm about:blank khi đang nạp lại vẫn giữ lượt.
      const key = `${candidate.documentId}|${candidate.index}|${candidate.source}`;
      const blank = await isFrameBlank(page, candidate.index);
      let state = tab.frames.get(key);
      if (!blank) { tab.frames.delete(key); continue; }
      if (!state) { state = { since: now, reloads: 0 }; tab.frames.set(key, state); }
      if (state.reloads >= MAX_FRAME_RELOADS || now - state.since < BLANK_WAIT_MS * (state.reloads + 1)) continue;
      const done = await page.evaluate(({ index, source }) => {
        const frame = document.querySelectorAll('iframe')[index];
        if (!frame || frame.getAttribute('src') !== source) return false;
        // Gán lại đúng src khi request cũ còn treo thì trình duyệt bỏ qua: hủy bằng about:blank rồi nạp lại.
        frame.setAttribute('src', 'about:blank');
        setTimeout(() => frame.setAttribute('src', source), 50);
        return true;
      }, candidate).catch(() => false);
      if (!done) continue;
      state.reloads++;
      reloaded = true;
      options.onLog?.({ type: 'offer_frame_reload', detail: `Iframe offer ${host} vẫn trống sau ${Math.round((now - state.since) / 1000)} giây; nạp lại riêng iframe, lần ${state.reloads}/${MAX_FRAME_RELOADS} (giữ trang cha).`, frameReloads: state.reloads }, page);
    }
    return reloaded;
  } catch {
    // Trang vừa điều hướng/đóng: watcher không được sập vì bước phụ này.
    return false;
  } finally { tab.pending = false; }
}

/**
 * Iframe thứ index của trang cha đã có nội dung offer hiển thị chưa.
 * @param {object} page Tab Playwright.
 * @param {number} index Vị trí iframe trong document.querySelectorAll('iframe').
 * @return {Promise<boolean>} True khi iframe trống hoặc chưa tải.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
async function isFrameBlank(page, index) {
  let element;
  try {
    element = await page.locator('iframe').nth(index).elementHandle({ timeout: 1000 });
    const frame = await element?.contentFrame();
    if (!frame || !frame.url() || frame.url() === 'about:blank' || /^(chrome-error:|about:neterror)/i.test(frame.url())) return true;
    const content = await readEvidenceWithTimeout(frame, 'offer-frame-content', () => frame.evaluate(() => {
      const ipBar = document.getElementById('__autolead_ip_bar');
      const text = (document.body?.innerText || '').replace(ipBar?.innerText || '\u0000', '').replace(/\s+/g, ' ').trim();
      const controls = document.querySelectorAll('input:not([type="hidden"]),select,textarea,button,a[href],[role="button"]').length;
      const images = Array.from(document.images).some(image => image.naturalWidth > 32 && image.getBoundingClientRect().height > 32);
      return Boolean(text) || controls > 0 || images || document.querySelectorAll('canvas,video,iframe').length > 0;
    }));
    return !content;
  } catch { return false; }
  finally { await element?.dispose().catch(() => {}); }
}
