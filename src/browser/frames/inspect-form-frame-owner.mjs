import { isHeavyAdOrTrackerUrl } from '../data-saver/is-heavy-ad-or-tracker-url.mjs';
import { readEvidenceWithTimeout } from '../../logging/recorder/read-evidence-with-timeout.mjs';
import { FORM_UTILITY_REGIONS } from '../locators/form-utility-regions.mjs';

/**
 * Kiểm tra từng thẻ nhúng trong tài liệu cha, kể cả khi frame khác origin.
 * @param {object} frame Frame Playwright cần xác minh.
 * @param {{iframeOnly?: boolean}} options Yêu cầu tài liệu nằm trong thẻ iframe đối với tab phụ.
 * @return {Promise<'eligible'|'excluded'|'unknown'>} Vùng nội dung, vùng phụ hoặc chưa đọc được.
 * @throws {never} Lỗi đọc tài liệu được trả về dưới dạng unknown.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export async function inspectFormFrameOwner(frame, { iframeOnly = false } = {}) {
  return readEvidenceWithTimeout(frame, 'form-frame-owner', async () => {
    for (let current = frame; current.parentFrame(); current = current.parentFrame()) {
      const owner = await current.frameElement();
      try {
        const placement = await owner.evaluate((element, excludedRegions) => {
          if (!element.isConnected) return { state: 'unknown' };
          const main = 'main, [role="main"], #main, #content, .main-content, .site-main';
          let inContent = false;
          let form = null;
          for (let ancestor = element; ancestor; ancestor = ancestor.parentElement || ancestor.getRootNode().host) {
            if (ancestor.matches(excludedRegions + ', header, [role="banner"], [hidden], [inert]')) return { state: 'excluded' };
            if (ancestor.matches(main + ', [role="dialog"], [aria-modal="true"], dialog[open]')) inContent = true;
            if (ancestor.matches('form, [role="form"]')) form = ancestor;
            const style = getComputedStyle(ancestor);
            if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return { state: 'excluded' };
          }
          if (!inContent) {
            const visibleMain = Array.from(document.querySelectorAll(main)).filter(root => root.getClientRects().length);
            if (visibleMain.length && !visibleMain.some(root => form?.contains(root))) return { state: 'excluded' };
          }
          const bounds = element.getBoundingClientRect();
          if (element.clientWidth <= 4 || element.clientHeight <= 4 || bounds.width <= 4 || bounds.height <= 4 || bounds.right + scrollX <= 0 || bounds.bottom + scrollY <= 0) return { state: 'excluded' };
          return { state: 'eligible', source: element.src, tag: element.localName };
        }, FORM_UTILITY_REGIONS);
        if (placement.state !== 'eligible') return placement.state;
        if (iframeOnly && current === frame && placement.tag !== 'iframe') return 'excluded';
        for (const source of [placement.source, current.url()]) {
          if (!source) continue;
          const host = new URL(source).hostname;
          if (isHeavyAdOrTrackerUrl(source) || /(?:^|\.)(?:doubleclick\.net|googlesyndication\.com|googleadservices\.com|googletagmanager\.com|amazon-adsystem\.com)$/.test(host)) return 'excluded';
        }
      } finally {
        await owner.dispose().catch(() => {});
      }
    }
    return frame.isDetached() ? 'unknown' : 'eligible';
  }).catch(() => 'unknown');
}
