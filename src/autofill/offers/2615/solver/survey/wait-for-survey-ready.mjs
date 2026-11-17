/**
 * Chờ khảo sát trong frame tải xong hoàn toàn câu hỏi và lựa chọn trước khi click.
 * Riêng cho luồng giải Offer 2615.
 * Tránh click vội khi iframe/AJAX đang quay spinner hoặc chưa render xong DOM câu hỏi.
 *
 * @param {object} frame Frame Playwright đang chứa khảo sát.
 * @param {object} [options={}] Tùy chọn timeoutMs, intervalMs và callback log.
 * @return {Promise<object>} Kết quả { ready, optionsCount, waitedMs, reason }.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
export async function waitForSurveyReady(frame, { timeoutMs = 5000, intervalMs = 200, onLog } = {}) {
  if (!frame || typeof frame.evaluate !== 'function') {
    return { ready: false, optionsCount: 0, waitedMs: 0, reason: 'invalid_frame' };
  }

  const startTime = Date.now();
  let pollCount = 0;

  while (Date.now() - startTime < timeoutMs) {
    pollCount++;
    try {
      const state = await frame.evaluate(() => {
        /**
         * Kiểm tra phần tử hiển thị thực sự qua cây DOM.
         * @param {Element|null} el Phần tử cần kiểm tra.
         * @return {boolean} True khi phần tử có kích thước và nhìn thấy được.
         */
        const isVisible = el => {
          if (!el || !el.isConnected) return false;
          for (let node = el; node; node = node.parentElement) {
            const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
            if (node.hidden || node.hasAttribute('inert') || (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0'))) {
              return false;
            }
          }
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };

        // 1. Kiểm tra dấu hiệu đang tải (Spinner, Loader, aria-busy, text "Loading...")
        const spinnerSelectors = [
          '.spinner', '.loading', '.loader', '[aria-busy="true"]',
          '[class*="spinner" i]', '[class*="loading" i]', '[class*="load-spin" i]',
          '[id*="spinner" i]', '[id*="loading" i]',
          'svg[class*="spin" i]', 'img[src*="spin" i]', 'img[src*="loading" i]'
        ].join(', ');

        const spinnerElements = Array.from(document.querySelectorAll(spinnerSelectors)).filter(isVisible);
        const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const hasLoadingText = /^(loading(?:\s+(?:survey|questions|content))?|please wait|đang tải)[\s.!…]*$/i.test(bodyText) ||
          /\b(loading questions|loading survey|please wait while we load)\b/i.test(bodyText);

        const isBusy = spinnerElements.length > 0 || hasLoadingText;

        // 2. Tìm container khảo sát
        const surveyContainers = Array.from(document.querySelectorAll([
          '#questionText', '.survey-container', '.quiz-container', '.survey-card',
          '.quiz-step', '.survey-step', '#AS_SURVEY', '.twy-campaigns',
          '[class*="survey-card" i]', '[class*="quiz-card" i]', '.card-options',
          '.question-answers', '#reg-container', '.twy-customquestion'
        ].join(', '))).filter(isVisible);

        // 3. Đếm các lựa chọn / nút câu hỏi khảo sát hiển thị
        const optionSelectors = [
          '[id="btn-option"]', '[id^="btn-option"]', '.btn-option', '.btn_option',
          'button[class*="answer" i]', 'button[class*="option" i]', 'button[class*="choice" i]', 'button[class*="response" i]',
          'a[class*="answer" i]', 'a[class*="option" i]', 'a[class*="choice" i]', 'a[class*="response" i]',
          'button[id*="answer" i]', 'button[id*="option" i]', 'button[id*="choice" i]', 'button[id*="response" i]',
          'input[type="radio"]', '[role="radio"]', '[role="option"]',
          '.survey-option', '.quiz-option', '.choice-card', '.option-card', '.answer-card',
          '.matrix-cell', '.rating-scale', 'button.qualifier-option-button',
          'a.choice', 'a.option-btn', 'a.answer-btn', 'button[id^="answer-"]'
        ].join(', ');

        const rawOptions = Array.from(document.querySelectorAll(optionSelectors));
        const visibleOptions = rawOptions.filter(el => {
          if (!isVisible(el)) {
            // Hỗ trợ radio có label hiển thị
            if (el.matches('input[type="radio"]') && Array.from(el.labels || []).some(isVisible)) return true;
            return false;
          }
          // Loại bỏ các nút điều hướng (Next, Submit, Cancel, Back, Privacy, Terms)
          const text = (el.innerText || el.textContent || el.value || '').trim();
          if (/^(continue|next|submit|back|cancel|skip|privacy|terms|cookie)\b/i.test(text)) return false;
          return true;
        });

        return {
          isBusy,
          hasContainer: surveyContainers.length > 0,
          optionsCount: visibleOptions.length
        };
      }).catch(() => null);

      if (state) {
        // Nếu đã có lựa chọn hiển thị và không còn bận/quay spinner -> ĐÃ SẴN SÀNG!
        if (state.optionsCount > 0 && !state.isBusy) {
          const waitedMs = Date.now() - startTime;
          if (waitedMs > 300) {
            onLog?.({
              type: 'survey_ready',
              detail: `[Offer 2615] Khảo sát đã tải xong đầy đủ câu hỏi (${state.optionsCount} lựa chọn) sau ${waitedMs}ms. Sẵn sàng click đáp án.`
            });
          }
          return { ready: true, optionsCount: state.optionsCount, waitedMs, reason: 'options_rendered' };
        }

        // Nếu không có container khảo sát nào và cũng không bận -> không phải màn khảo sát cần chờ
        if (!state.hasContainer && !state.isBusy && state.optionsCount === 0 && pollCount >= 2) {
          return { ready: false, optionsCount: 0, waitedMs: Date.now() - startTime, reason: 'no_survey_container' };
        }
      }
    } catch {}

    await new Promise(r => setTimeout(r, intervalMs));
  }

  const waitedMs = Date.now() - startTime;
  return { ready: false, optionsCount: 0, waitedMs, reason: 'timeout_waiting_for_survey' };
}
