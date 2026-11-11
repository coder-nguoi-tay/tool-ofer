/**
 * Xử lý màn có nút "Skip" (`#skip_offer`) — gồm 2 biến thể:
 * 1) Màn "Continue Through Gmail" (nút Google OAuth + Skip): user chỉ định KHÔNG vào Google, bấm Skip.
 * 2) Màn choice-offer có "No Call / Skip Offer" (không có #questionText/#google_oauth_signup_button
 *    nên trượt cả handler MUI lẫn handler cũ) — cũng bấm Skip.
 * Nói chung: khi thấy `#skip_offer` hiện và chưa bấm → bấm Skip. Click thật, throttle 2s.
 *
 * @param {object} page Trang Playwright hiện tại.
 * @param {object} frame Frame đang quét.
 * @param {object} [options={}] Tùy chọn (onLog).
 * @return {Promise<number>} Số thao tác đã thực hiện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function handleGoogleOauthSkip(page, frame, options = {}) {
  if (!frame || typeof frame.locator !== 'function') return 0;
  const now = Date.now();
  if (frame._uxGmailSkipHandledAt && now - frame._uxGmailSkipHandledAt < 2000) return 0;
  frame._uxGmailSkipHandledAt = now;
  const state = await frame.evaluate(() => {
    const skip = document.querySelector('#skip_offer');
    if (!skip) return null;
    const s = getComputedStyle(skip);
    if (s.display === 'none' || s.visibility === 'hidden') return null;
    const r = skip.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2) return null;
    if (skip.getAttribute('data-ux-gmail-skip-clicked') === '1') return null;
    skip.setAttribute('data-ux-gmail-skip-clicked', '1');
    const nameMatch = (document.querySelector('#questionText')?.innerText || document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 60);
    return {
      name: nameMatch
    };
  }).catch(() => null);
  if (!state) return 0;
  try {
    const loc = frame.locator('#skip_offer').first();
    if ((await loc.count().catch(() => 0)) > 0) {
      await frame.evaluate(() => {
        const el = document.querySelector('#skip_offer');
        if (!el) return;
        el.classList.remove('ai-pointer-events-none');
        el.style.pointerEvents = 'auto';
        el.style.visibility = 'visible';
        let a = el.parentElement;
        while (a && a !== document.body) {
          a.style.visibility = 'visible';
          a = a.parentElement;
        }
      }).catch(() => {});
      let clicked = await loc.click({
        force: true,
        timeout: 3000
      }).then(() => true).catch(() => false);
      if (!clicked) {
        const box = await loc.boundingBox().catch(() => null);
        if (box && box.width > 2 && box.height > 2) {
          await page.mouse.click(box.x + Math.min(box.width / 2, box.width - 3), box.y + Math.min(box.height / 2, box.height - 3), {
            delay: 20
          }).catch(() => {});
          clicked = true;
        }
      }
      if (clicked) {
        options.onLog?.({
          type: 'gmail_oauth_skipped',
          detail: `[Skip] Màn có nút Skip "${state.name || ''}" — đã bấm Skip bỏ qua.`
        });
        return 1;
      }
    }
  } catch {}
  return 0;
}
export { handleGoogleOauthSkip };
