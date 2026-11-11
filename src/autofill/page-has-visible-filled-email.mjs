/**
 * Tab (kể cả iframe) có ô email đang hiển thị không. Mặc định chỉ tính ô đã có email (chứa "@").
 *
 * @param {object} page Tab Playwright.
 * @param {{anyValue?: boolean}} [opts] anyValue: tính cả ô email rỗng.
 * @return {Promise<boolean>} True nếu có ô email hiển thị thoả điều kiện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function pageHasVisibleFilledEmail(page, {
  anyValue = false
} = {}) {
  const frames = page._activeAutofillFrame ? [page._activeAutofillFrame] : typeof page.frames === 'function' ? page.frames() : [page];
  for (const scanFrame of frames) {
    const hasEmail = await scanFrame.evaluate(payload => {
      const any = typeof payload === 'object' ? payload.anyValue : payload;
      const scopeSelector = typeof payload === 'object' ? payload.scopeSelector : null;
      const inputs = Array.from(document.querySelectorAll('input[type="email"], input[name*="email" i], input[id*="email" i]'));
      return inputs.some(i => {
        if (i.type === 'hidden' || scopeSelector && !i.matches(scopeSelector)) return false;
        if (!any && !String(i.value || '').trim().includes('@')) return false;
        // Ô địa chỉ nhà bị bắt nhầm; "emailAddress"/"email_address" vẫn là ô email.
        const key = i.name || i.id || '';
        if (/street/i.test(key) || /address/i.test(key) && !/mail/i.test(key)) return false;
        const s = getComputedStyle(i);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        const r = i.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
      });
    }, scanFrame._activeAutofillFormScope ? { anyValue, scopeSelector: scanFrame._activeAutofillFormScope.memberSelector } : anyValue).catch(() => false);
    if (hasEmail === true || (hasEmail && typeof hasEmail === 'object' && !Array.isArray(hasEmail) && hasEmail.hasEmailInput)) return true;
  }
  return false;
}
export { pageHasVisibleFilledEmail };
