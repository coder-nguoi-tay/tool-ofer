import { performSurveyAnswer } from '../survey-solver/verification/perform-survey-answer.mjs';
/**
 * Xử lý thẻ SOI yes/no của funnel "alpha-intent" (SweepstakesAlerts / PrizeGrab):
 * - Tick consent TCPA (data-tf-element-role="consent-opt-in") nếu chưa tick.
 * - Chọn Yes (70%) / No (30%) theo cùng tỉ lệ với thẻ co-reg twy, click bằng chuột thật.
 * - Mỗi thẻ chỉ xử lý 1 lần (đánh dấu data-ux-soi-done).
 *
 * @param {object} page Trang Playwright hiện tại.
 * @param {object} frame Frame đang quét.
 * @param {object} [options={}] Tùy chọn (onLog).
 * @return {Promise<number>} Số thẻ đã trả lời.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function handleAlphaIntentSoiCards(page, frame, options = {}) {
  if (!frame || typeof frame.locator !== 'function') return 0;
  const now = Date.now();
  if (frame._uxSoiHandledAt && now - frame._uxSoiHandledAt < 2000) return 0;
  frame._uxSoiHandledAt = now;
  let done = 0;

  // Bước 1 & 2: Quét thẻ SOI / secondary co-reg offer chưa xử lý và xác định nút Yes/No
  let pickedInfo = null;
  try {
    pickedInfo = await frame.evaluate(formScope => {
      const isVisible = el => {
        if (!el || el.disabled || formScope && !el.matches(formScope.memberSelector)) return false;
        for (let ancestor = el; ancestor; ancestor = ancestor.parentElement) {
          const state = getComputedStyle(ancestor);
          if (ancestor.hidden || ancestor.hasAttribute('inert') || state.display === 'none' || ['hidden','collapse'].includes(state.visibility) || state.opacity === '0') return false;
        }
        const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      // Các selector định danh container thẻ offer / câu hỏi Yes-No
      const cardSelectors = ['[data-object-creative-type="soiyesno"]', 'form[data-tf-element-role="offer"]', '[data-tf-element-role="offer"]', '.ct-creative-path-theme', '#ct-creatives-container', '[ct-creatives-container]', '.mock-secondary-offer-card', '.ai-content--offer', '[id^="offers_list-"]', '.soi-card', '.soi-container', 'div:has(> #actions .ct-creative-submit)', 'div:has(.ct-creative-actions)', 'div:has(#ct-creative-submit-yes, #ct-creative-submit-no)', 'div:has(a[id^="ct-creative-submit-"])'];
      let candidateCards = Array.from(document.querySelectorAll(cardSelectors.join(', '))).filter(c => isVisible(c) && c.getAttribute('data-ux-soi-done') !== '1');

      // Nếu không có card theo selector riêng, kiểm tra xem toàn trang / container câu hỏi có nút Yes/No SOI không
      if (!candidateCards.length) {
        const hasSoiButtons = Boolean(document.querySelector('#ct-creative-submit-yes, #ct-creative-submit-no, [id^="ct-creative-submit-"], [data-mock-secondary-offer-action], .ct-creative-submit'));
        if (hasSoiButtons) {
          const mainArea = document.querySelector('main, .main, #main, section, .content, form, .survey-container, .question-container') || document.body;
          if (mainArea && mainArea.getAttribute('data-ux-soi-done') !== '1') {
            candidateCards = [mainArea];
          }
        }
      }
      if (!candidateCards.length) return null;
      for (const card of candidateCards) {
        // Tìm các nút hoặc link bấm bên trong thẻ
        const clickables = Array.from(card.querySelectorAll(['#ct-creative-submit-yes', '#ct-creative-submit-no', 'a[id^="ct-creative-submit-"]', 'button[id^="ct-creative-submit-"]', '.ct-creative-submit', '[data-mock-secondary-offer-action]', 'button.btn-yes', 'button.btn-no', 'a.btn-yes', 'a.btn-no', '.yes-btn', '.no-btn', 'button.ai-submit-button', 'a.ai-submit-button', 'button.ai-skip', 'a.ai-skip', 'button', 'a[role="button"]', 'a.btn', 'a.button', '[role="button"]'].join(', '))).filter(isVisible);
        let yesBtn = null;
        let noBtn = null;
        for (const el of clickables) {
          const id = (el.id || '').toLowerCase();
          const className = (el.className || '').toLowerCase();
          const text = (el.innerText || el.textContent || el.value || '').trim().toLowerCase();
          const action = (el.getAttribute('data-mock-secondary-offer-action') || '').toLowerCase();
          const role = (el.getAttribute('data-tf-element-role') || '').toLowerCase();
          const isYes = id === 'ct-creative-submit-yes' || action === 'accept' || className.includes('btn-yes') || className.includes('yes-btn') || /^(yes|yes\b|claim|claim\s*what's\s*mine|claim\s*now|có|đồng ý)$/i.test(text);
          const isNo = id === 'ct-creative-submit-no' || action === 'decline' || className.includes('ai-skip') || className.includes('btn-no') || className.includes('no-btn') || /^(no|no thanks|no, thanks|decline|pass|skip|not now|bỏ qua|không)$/i.test(text);
          if (isYes && !yesBtn) yesBtn = el;
          if (isNo && !noBtn) noBtn = el;
        }
        if (!yesBtn && !noBtn) continue;

        // Quyết định chọn Yes hay No:
        // Nếu có cả 2: chọn ngẫu nhiên (70% No / 30% Yes) để ưu tiên vượt qua co-reg offer nhanh chóng mà không bị kẹt form phụ
        let choice = 'yes';
        if (yesBtn && noBtn) {
          choice = Math.random() < 0.7 ? 'no' : 'yes';
        } else if (noBtn) {
          choice = 'no';
        } else {
          choice = 'yes';
        }
        const chosenEl = choice === 'yes' ? yesBtn : noBtn;
        if (!chosenEl) continue;

        // Nếu chọn Yes, kiểm tra và tick consent TCPA nếu có trong thẻ
        let consentSelector = null;
        if (choice === 'yes') {
          const consent = card.querySelector('input[data-tf-element-role="consent-opt-in"],input[type="checkbox"]:not(:checked)');
          if (consent && !consent.checked) {
            const consentId = crypto.randomUUID();
            consent.setAttribute('data-ux-soi-consent',consentId);
            consentSelector = `[data-ux-soi-consent="${consentId}"]`;
          }
        }
        const uid = `soi_btn_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        chosenEl.setAttribute('data-ux-soi-btn-id', uid);
        card.setAttribute('data-ux-soi-card',uid);
        return {
          choice,
          uid,
          consentSelector,
          text: (chosenEl.innerText || chosenEl.textContent || '').trim().slice(0, 40),
          tag: chosenEl.tagName.toLowerCase(),
          id: chosenEl.id || null
        };
      }
      return null;
    }, frame._activeAutofillFormScope || null).catch(() => null);
  } catch {}
  if (!pickedInfo) return 0;
  if (pickedInfo.consentSelector) {
    const consent = await performSurveyAnswer(frame, frame.locator(pickedInfo.consentSelector).first(), options);
    if (!consent.verified) return 0;
    if (consent.dispatched) done++;
  }
  const result = await performSurveyAnswer(frame, frame.locator(`[data-ux-soi-btn-id="${pickedInfo.uid}"]`).first(), options);
  if (!result.dispatched || !result.verified) return done;
  await frame.locator(`[data-ux-soi-card="${pickedInfo.uid}"]`).evaluateAll(cards => cards.forEach(card => {
    card.setAttribute('data-ux-soi-done','1');
    card.setAttribute('data-ux-opened','1');
  })).catch(() => {});
  options.onLog?.({ type: 'soi_answered', detail: `Đã xác minh lựa chọn SOI ${pickedInfo.choice}.` });
  return done + 1;
}
export { handleAlphaIntentSoiCards };
