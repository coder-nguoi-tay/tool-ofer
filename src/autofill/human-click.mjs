import { inspectInteractionReadiness } from '../browser/locators/inspect-interaction-readiness.mjs';
import { inspectFormFrameOwner } from '../browser/frames/inspect-form-frame-owner.mjs';
import { isSecondaryOfferTab } from '../leads/actions/is-secondary-offer-tab.mjs';
import { usesGoLoginAndroidTouchInput } from '../browser/gologin/attach-android-touch-input.mjs';
import { shouldStopAfterLead } from './should-stop-after-lead.mjs';
import { resolveVisibleControlLabel } from '../browser/locators/resolve-visible-control-label.mjs';
import { scrollToFormControl } from './form-scope/scroll-to-form-control.mjs';
import { humanMouseMove } from './human-mouse-move.mjs';
import { shouldAnimatePageMouse } from './interaction/should-animate-page-mouse.mjs';
import { renderBrowserMousePointer } from './interaction/render-browser-mouse-pointer.mjs';

/**
 * Kiểm tra điểm giữa của control sau khi rê, kể cả link lồng trong nhãn checkbox.
 * @param {Element} element Control đã được cuộn vào vùng nhìn thấy.
 * @return {boolean} Điểm bấm nằm trên control hoặc nội dung của chính control.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
function centerHitsControl(element) {
  const bounds = element.getBoundingClientRect();
  const hit = element.getRootNode().elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  return Boolean(hit && element.contains(hit) && hit.closest('a[href]') === element.closest('a[href]'));
}

/**
 * Bấm đúng control và đúng frame đã chọn, kể cả khi trang đổi bố cục lúc rê chuột.
 * @param {object|null} page Tab Playwright sở hữu control.
 * @param {object} target Locator hoặc ElementHandle của control.
 * @return {Promise<boolean>} Đã gửi một lần bấm tới control đã xác minh.
 * @throws {never} Dừng khi control bị thay thế, bị che hoặc scope đã đổi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function humanClick(page, target) {
  if (!target) return false;
  const activePage = page || target.page?.();
  if (activePage?._manualCaptchaPending || activePage?._autofillWaitingForFormFrame || shouldStopAfterLead(activePage?._autofillSession)) return false;
  let pinned, pointer;
  try {
    // Locator có thể trỏ sang phần tử khác sau khi UI render lại.
    pinned = target.elementHandle ? await target.elementHandle({ timeout: 300 }) : null;
    const control = target.elementHandle ? pinned : target;
    if (!control) return false;
    const frame = await control.ownerFrame?.();
    const selected = activePage?._activeAutofillFrame;
    const iframeOnly = isSecondaryOfferTab(activePage);
    if (iframeOnly && (!frame?.parentFrame?.() || selected !== frame)) return false;
    if (control.ownerFrame && !frame) return false;
    if (selected && frame && (selected.mainFrame?.() || selected) !== frame) return false;
    if (frame?.parentFrame() && await inspectFormFrameOwner(frame, { iframeOnly }) !== 'eligible') return false;
    const scopeOwner = frame && (frame !== activePage?.mainFrame?.() || frame._activeAutofillFormScope) ? frame : activePage;
    const scope = scopeOwner?._activeAutofillFormScope;
    if (control.evaluate) {
      const readiness = await control.evaluate(inspectInteractionReadiness, scope || null);
      if (!readiness?.ready) return false;
      if (readiness.useLabel) {
        const labelHandle = await resolveVisibleControlLabel(control);
        try {
          const label = labelHandle?.asElement();
          return label ? await humanClick(activePage, label) : false;
        } finally { await labelHandle?.dispose(); }
      }
    }
    if (activePage?._manualCaptchaPending) return false;
    await scrollToFormControl(control);
    if (shouldAnimatePageMouse(activePage) && activePage?.mouse && control.boundingBox) {
      const box = await control.boundingBox();
      if (box?.width > 0 && box.height > 0) {
        pointer = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        await humanMouseMove(activePage, pointer.x, pointer.y);
        await renderBrowserMousePointer(activePage, pointer.x, pointer.y, true);
      }
    }
    const currentScope = scopeOwner?._activeAutofillFormScope;
    if (currentScope?.id !== scope?.id || currentScope?.unavailable || currentScope?.active === false) return false;
    if (control.evaluate && !(await control.evaluate(inspectInteractionReadiness, currentScope || null))?.ready) return false;
    if ((pinned || control.ownerFrame) && !await control.evaluate(centerHitsControl)) return false;
    if (activePage?._manualCaptchaPending || activePage?._activeAutofillFrame !== selected || activePage?._autofillWaitingForFormFrame || shouldStopAfterLead(activePage?._autofillSession)) return false;
    if (usesGoLoginAndroidTouchInput(activePage)) {
      if (!pointer) return false;
      await control.hover({ trial: true, timeout: 500 });
      const current = await control.boundingBox();
      if (!current || Math.abs(current.x + current.width / 2 - pointer.x) > 1 || Math.abs(current.y + current.height / 2 - pointer.y) > 1) return false;
      if (activePage?._manualCaptchaPending) return false;
      await activePage.mouse.move(pointer.x, pointer.y);
      if (!await control.evaluate(centerHitsControl) || activePage?._manualCaptchaPending || shouldStopAfterLead(activePage?._autofillSession)) return false;
      try {
        await activePage.mouse.down();
        await activePage.mouse.up();
      } catch {
        await activePage.mouse.up().catch(() => {});
        return false;
      }
    } else {
      await control.click({ force: false, timeout: 600, delay: 30 });
    }
    return true;
  } catch {
    return false;
  } finally {
    if (pointer) await renderBrowserMousePointer(activePage, pointer.x, pointer.y, false);
    await pinned?.dispose().catch(() => {});
  }
}
