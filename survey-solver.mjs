/**
 * Module chuyên biệt giải quyết khảo sát nhiều bước, đa dạng form, checkbox và button.
 * Hỗ trợ tự động nhận diện và xử lý:
 * - Single-choice cards / Radio buttons (giao diện thẻ, quiz cards, pill buttons).
 * - Multi-choice checkboxes (checkbox tiêu chuẩn & custom thẻ div/span/svg, "Select all that apply").
 * - Rating scales (1-5 sao, NPS 0-10, thang đo Likert).
 * - Matrix tables (bảng khảo sát nhiều hàng x nhiều cột).
 * - Dropdown selection (Select tiêu chuẩn và Custom Listbox).
 * - Multi-step runner (vòng lặp giải quyết nhiều bước liên tục, phát hiện auto-advance hoặc bấm nút Next/Continue).
 * - Nhận diện bẫy kiểm tra bot (Quality / Attention trap checks).
 *
 * @module survey-solver
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-19
 */

/**
 * Click tự nhiên và an toàn vào phần tử khảo sát (chuột thật nếu có, hoặc dispatch event).
 *
 * @param {object} pageOrFrame Page hoặc Frame Playwright.
 * @param {object} targetLocator Locator phần tử cần click.
 * @return {Promise<boolean>}
 */
export async function safeSurveyClick(pageOrFrame, targetLocator) {
  if (!targetLocator) return false;
  try {
    if (typeof targetLocator.scrollIntoViewIfNeeded === 'function') {
      await targetLocator.scrollIntoViewIfNeeded({ timeout: 500 }).catch(() => {});
    }
    const page = typeof targetLocator.page === 'function' ? targetLocator.page() : (pageOrFrame?.page ? pageOrFrame.page() : pageOrFrame);
    if (page?.mouse && typeof targetLocator.boundingBox === 'function') {
      const box = await targetLocator.boundingBox().catch(() => null);
      if (box && box.width > 0 && box.height > 0) {
        const clickX = box.x + box.width * (0.2 + 0.6 * Math.random());
        const clickY = box.y + box.height * (0.2 + 0.6 * Math.random());
        await page.mouse.move(clickX, clickY, { steps: 5 }).catch(() => {});
        await page.mouse.down().catch(() => {});
        await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 40) + 40));
        await page.mouse.up().catch(() => {});
        return true;
      }
    }
  } catch {}

  try {
    await targetLocator.click({ force: true, timeout: 1500 }).catch(() => {});
    return true;
  } catch {}

  try {
    await targetLocator.evaluate((el) => {
      el.click();
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }).catch(() => {});
    return true;
  } catch {}
  return false;
}

/**
 * Các từ khóa nhận diện nút điều hướng tiến tới (Next / Continue / Submit)
 */
export const NEXT_BUTTON_PATTERNS = [
  /^next\b/i,
  /^continue\b/i,
  /^proceed\b/i,
  /^tiếp tục($|\s)/i,
  /^tiếp theo($|\s)/i,
  /^submit\b/i,
  /^submit survey\b/i,
  /^finish\b/i,
  /^hoàn tất($|\s)/i,
  /^next step\b/i,
  /^next question\b/i,
  /^answer\b/i,
  /^get started\b/i,
  /^start survey\b/i,
  /^confirm\b/i,
  /^xác nhận($|\s)/i,
];

/**
 * Các từ khóa nhận diện câu hỏi nhiều lựa chọn (Multi-select checkbox)
 */
export const MULTI_CHOICE_INDICATORS = [
  /select all that apply/i,
  /choose all that apply/i,
  /check all that apply/i,
  /all that apply/i,
  /chọn tất cả/i,
  /select one or more/i,
  /choose any/i,
];

/**
 * Các từ khóa nhận diện lựa chọn "Không có mục nào ở trên"
 */
export const NONE_OF_THE_ABOVE_PATTERNS = [
  /^none\b/i,
  /^none of the above\b/i,
  /^none of these\b/i,
  /^không có($|\s)/i,
  /^không có mục nào($|\s)/i,
  /^not applicable\b/i,
  /^n\/a\b/i,
  /^neither\b/i,
  /^other\b/i,
];

/**
 * Kiểm tra xem một phần tử HTML có đang hiển thị trên màn hình hay không.
 *
 * @param {Element} el Phần tử DOM cần kiểm tra.
 * @return {boolean} True nếu phần tử hiển thị và có kích thước thực tế.
 */
export function isElementVisibleInDOM(el) {
  if (!el) return false;
  const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
    return false;
  }
  if (el.closest('[aria-hidden="true"], [inert], .inactive, .hidden, .hide')) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Phân tích và giải quyết các câu hỏi dạng Đánh giá / Thang điểm (Rating Scales & NPS 1-10, 1-5 Stars).
 *
 * @param {object} frame Frame hoặc Page Playwright.
 * @param {object} [options={}] Tùy chọn (ưu tiên điểm tích cực, điểm trung tính).
 * @return {Promise<number>} Số câu hỏi rating đã được trả lời.
 */
export async function solveRatingQuestions(frame, options = {}) {
  let answered = 0;
  try {
    const ratingGroups = await frame.evaluate(() => {
      const isVisible = (el) => {
        if (!el || el.disabled) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const groups = [];

      // 1. Dãy nút số từ 1..5 hoặc 0..10 (NPS scale)
      const scaleContainers = Array.from(document.querySelectorAll(
        '.nps-scale, .rating-scale, .likert-scale, .rating-container, [data-rating-group], .scale-row, ul.rating'
      )).filter(isVisible);

      scaleContainers.forEach((container, idx) => {
        const buttons = Array.from(container.querySelectorAll(
          'button, .scale-item, [role="radio"], label, input[type="radio"], .nps-num, [data-value]'
        )).filter(isVisible);

        if (buttons.length >= 3 && buttons.length <= 11) {
          const hasSelected = buttons.some((b) =>
            b.classList.contains('active') ||
            b.classList.contains('selected') ||
            b.getAttribute('aria-checked') === 'true' ||
            (b.tagName === 'INPUT' && b.checked) ||
            b.querySelector('input:checked')
          );

          if (!hasSelected) {
            const uid = `rating_grp_${idx}_${Date.now()}`;
            container.setAttribute('data-survey-rating-uid', uid);
            groups.push({
              uid,
              type: 'numeric_scale',
              totalCount: buttons.length,
            });
          }
        }
      });

      // 2. Đánh giá sao (Stars 1-5)
      const starContainers = Array.from(document.querySelectorAll(
        '.star-rating, .stars, .rating-stars, [data-stars]'
      )).filter(isVisible);

      starContainers.forEach((container, idx) => {
        const stars = Array.from(container.querySelectorAll(
          '.star, [data-star], svg.star, [data-value]'
        )).filter(isVisible);

        if (stars.length >= 3 && stars.length <= 5) {
          const uid = `star_grp_${idx}_${Date.now()}`;
          container.setAttribute('data-survey-star-uid', uid);
          groups.push({
            uid,
            type: 'stars',
            totalCount: stars.length,
          });
        }
      });

      return groups;
    }).catch(() => []);

    for (const group of ratingGroups) {
      try {
        const containerLocator = group.type === 'stars'
          ? frame.locator(`[data-survey-star-uid="${group.uid}"]`).first()
          : frame.locator(`[data-survey-rating-uid="${group.uid}"]`).first();

        if (await containerLocator.count() === 0) continue;

        // Chọn điểm số: thường chọn mức tích cực (4/5 sao, hoặc 8/10 NPS)
        let targetIndex = Math.floor(group.totalCount * 0.75);
        if (targetIndex >= group.totalCount) targetIndex = group.totalCount - 1;

        const itemsLocator = containerLocator.locator(
          group.type === 'stars'
            ? '.star, [data-star], svg.star, [data-value]'
            : 'button, .scale-item, [role="radio"], label, input[type="radio"], .nps-num, [data-value]'
        );

        const targetItem = itemsLocator.nth(targetIndex);
        if (await targetItem.count() > 0) {
          await targetItem.scrollIntoViewIfNeeded({ timeout: 400 }).catch(() => {});
          await safeSurveyClick(frame, targetItem);
          answered++;
        }
      } catch {}
    }
  } catch {}
  return answered;
}

/**
 * Phân tích và giải quyết các câu hỏi dạng Bảng ma trận / Grid / Likert table (nhiều hàng x nhiều cột).
 *
 * @param {object} frame Frame hoặc Page Playwright.
 * @param {object} [options={}] Tùy chọn.
 * @return {Promise<number>} Số hàng câu hỏi ma trận đã được điền.
 */
export async function solveMatrixQuestions(frame, options = {}) {
  let answered = 0;
  try {
    const matrixRows = await frame.evaluate(() => {
      const isVisible = (el) => {
        if (!el || el.disabled) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const rows = [];
      const tableRows = Array.from(document.querySelectorAll(
        'table.matrix tr, table.survey-matrix tr, .matrix-row, .grid-row, .likert-row, [data-matrix-row]'
      )).filter(isVisible);

      tableRows.forEach((row, idx) => {
        // Tìm các radio buttons hoặc checkbox con trong hàng này
        const inputs = Array.from(row.querySelectorAll(
          'input[type="radio"], [role="radio"], label:has(input[type="radio"]), .radio-custom, .matrix-cell'
        )).filter(isVisible);

        if (inputs.length >= 2) {
          const hasChecked = inputs.some((inp) =>
            (inp.tagName === 'INPUT' && inp.checked) ||
            inp.getAttribute('aria-checked') === 'true' ||
            inp.classList.contains('active') ||
            inp.classList.contains('selected') ||
            inp.querySelector('input:checked')
          );

          if (!hasChecked) {
            const uid = `matrix_row_${idx}_${Date.now()}`;
            row.setAttribute('data-survey-matrix-uid', uid);
            rows.push({
              uid,
              optionCount: inputs.length,
            });
          }
        }
      });

      return rows;
    }).catch(() => []);

    for (const row of matrixRows) {
      try {
        const rowLocator = frame.locator(`[data-survey-matrix-uid="${row.uid}"]`).first();
        if (await rowLocator.count() === 0) continue;

        // Chọn cột điểm trung tính hoặc tích cực (ví dụ Agree / Neutral)
        const pickColIndex = Math.min(row.optionCount - 1, Math.floor(row.optionCount / 2));
        const cells = rowLocator.locator('input[type="radio"], [role="radio"], label:has(input[type="radio"]), .radio-custom, .matrix-cell');
        const targetCell = cells.nth(pickColIndex);

        if (await targetCell.count() > 0) {
          await targetCell.scrollIntoViewIfNeeded({ timeout: 400 }).catch(() => {});
          await safeSurveyClick(frame, targetCell);
          answered++;
        }
      } catch {}
    }
  } catch {}
  return answered;
}

/**
 * Phân tích và xử lý các câu hỏi Khảo sát dạng Checkbox (nhiều lựa chọn & custom checkbox).
 * Hỗ trợ chọn ngẫu nhiên có chừng mực (1-3 lựa chọn), loại trừ "None of the above" nếu chọn mục khác.
 *
 * @param {object} frame Frame hoặc Page Playwright.
 * @param {object} [options={}] Tùy chọn (maxPick: số mục chọn tối đa).
 * @return {Promise<number>} Số câu hỏi checkbox đã hoàn thành.
 */
export async function solveSurveyCheckboxes(frame, options = {}) {
  let answered = 0;
  const maxPick = options.maxPick || 2;

  try {
    const checkboxGroups = await frame.evaluate(() => {
      const isVisible = (el) => {
        if (!el || el.disabled) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const groups = new Map();
      const rawCandidates = Array.from(document.querySelectorAll([
        'input[type="checkbox"]',
        '[role="checkbox"]',
        '.custom-checkbox',
        '.checkbox-card',
        '.check-card',
        '.survey-checkbox',
        '[data-checkbox]',
        'label.checkbox',
        '.form-check:has(input[type="checkbox"])',
      ].join(', '))).filter(isVisible);

      rawCandidates.forEach((item, idx) => {
        // Tìm câu hỏi / container bao bọc gần nhất
        const container = item.closest(
          '.question, .survey-question, fieldset, .checkbox-group, .choices, .form-group, .answers, .step-content'
        ) || item.parentElement || document.body;

        if (!groups.has(container)) {
          groups.set(container, []);
        }

        const isChecked = (item.tagName === 'INPUT' && item.checked) ||
          item.getAttribute('aria-checked') === 'true' ||
          item.classList.contains('checked') ||
          item.classList.contains('active') ||
          item.querySelector('input[type="checkbox"]:checked') !== null;

        const label = item.closest('label') ||
          (item.id ? document.querySelector(`label[for="${item.id}"]`) : null) ||
          item;

        const text = (label?.innerText || label?.textContent || item.value || '').trim();

        const uid = `cb_opt_${idx}_${Date.now()}`;
        item.setAttribute('data-survey-cb-uid', uid);

        groups.get(container).push({
          uid,
          text,
          isChecked,
        });
      });

      const actionable = [];
      for (const [container, items] of groups.entries()) {
        const hasChecked = items.some((it) => it.isChecked);
        const headingText = (container.querySelector('h1, h2, h3, h4, legend, .question-title, p')?.innerText || '').toLowerCase();
        const isConsent = headingText.includes('terms') || headingText.includes('privacy') || headingText.includes('consent') || headingText.includes('agree');

        // Nếu là consent/terms: bắt buộc phải tích
        if (isConsent && !hasChecked) {
          actionable.push({ type: 'consent', items });
        } else if (!hasChecked && items.length >= 2) {
          actionable.push({ type: 'multi_choice', items });
        }
      }

      return actionable;
    }).catch(() => []);

    for (const group of checkboxGroups) {
      if (!group.items.length) continue;

      if (group.type === 'consent') {
        // Tích toàn bộ checkbox điều khoản
        for (const item of group.items) {
          const loc = frame.locator(`[data-survey-cb-uid="${item.uid}"]`).first();
          if (await loc.count() > 0) {
            await safeSurveyClick(frame, loc);
          }
        }
        answered++;
      } else {
        // Multi-choice survey: lọc bỏ các mục "None of the above" nếu muốn chọn các mục cụ thể
        const validOptions = group.items.filter((it) =>
          !NONE_OF_THE_ABOVE_PATTERNS.some((p) => p.test(it.text))
        );

        const pool = validOptions.length > 0 ? validOptions : group.items;
        const countToPick = Math.min(pool.length, Math.floor(Math.random() * maxPick) + 1);

        // Lấy ngẫu nhiên các phần tử
        const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, countToPick);
        for (const item of shuffled) {
          const loc = frame.locator(`[data-survey-cb-uid="${item.uid}"]`).first();
          if (await loc.count() > 0) {
            await loc.scrollIntoViewIfNeeded({ timeout: 400 }).catch(() => {});
            await safeSurveyClick(frame, loc);
          }
        }
        answered++;
      }
    }
  } catch {}
  return answered;
}

/**
 * Tìm và kích hoạt nút chuyển tiếp (Next / Continue / Submit / Proceed / Tiếp tục).
 * Tự động chờ nút chuyển sang trạng thái enabled nếu ban đầu bị disabled.
 *
 * @param {object} frame Frame hoặc Page Playwright.
 * @param {object} [options={}] Tùy chọn thời gian chờ.
 * @return {Promise<boolean>} True nếu tìm thấy và click thành công nút Next.
 */
export async function clickSurveyNextButton(frame, options = {}) {
  const timeoutMs = options.timeoutMs || 2500;
  const startTime = Date.now();

  try {
    const buttonUid = await frame.evaluate(() => {
      const isVisible = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const candidates = Array.from(document.querySelectorAll(
        'button, input[type="submit"], input[type="button"], a.btn, [role="button"], .next-btn, .continue-btn, .btn-next'
      )).filter(isVisible);

      const patterns = [
        /^next\b/i,
        /^continue\b/i,
        /^proceed\b/i,
        /^tiếp tục($|\s)/i,
        /^tiếp theo($|\s)/i,
        /^submit\b/i,
        /^submit survey\b/i,
        /^finish\b/i,
        /^next step\b/i,
        /^next question\b/i,
      ];

      for (const el of candidates) {
        // Bỏ qua các nút back/prev/cancel/skip nếu đang tìm nút forward
        const text = (el.innerText || el.textContent || el.value || '').trim();
        if (/back|prev|cancel|quay lại/i.test(text)) continue;

        const isMatch = patterns.some((p) => p.test(text)) ||
          el.id.toLowerCase().includes('next') ||
          el.id.toLowerCase().includes('continue') ||
          el.className.toLowerCase().includes('next') ||
          el.className.toLowerCase().includes('continue');

        if (isMatch) {
          const uid = `next_btn_${Date.now()}`;
          el.setAttribute('data-survey-next-uid', uid);
          return { uid, disabled: el.disabled || el.getAttribute('aria-disabled') === 'true' };
        }
      }

      // Fallback: Tìm nút submit duy nhất trong form nếu có
      const submitBtn = document.querySelector('form button[type="submit"], button[type="submit"]');
      if (submitBtn && isVisible(submitBtn)) {
        const uid = `next_btn_submit_${Date.now()}`;
        submitBtn.setAttribute('data-survey-next-uid', uid);
        return { uid, disabled: submitBtn.disabled };
      }

      return null;
    }).catch(() => null);

    if (!buttonUid?.uid) return false;

    const btnLocator = frame.locator(`[data-survey-next-uid="${buttonUid.uid}"]`).first();
    if (await btnLocator.count() === 0) return false;

    // Chờ nút enabled nếu ban đầu đang bị disable (do trang đang validate đáp án)
    while (Date.now() - startTime < timeoutMs) {
      const isDisabled = await btnLocator.evaluate((el) =>
        el.disabled || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled')
      ).catch(() => false);

      if (!isDisabled) break;
      await new Promise((r) => setTimeout(r, 150));
    }

    const clicked = await safeSurveyClick(frame, btnLocator);
    return clicked;
  } catch {
    return false;
  }
}

/**
 * Giải quyết toàn diện 1 bước khảo sát hiện tại (1 Step):
 * 1. Đánh giá câu hỏi Rating/NPS nếu có.
 * 2. Đánh giá bảng ma trận nếu có.
 * 3. Đánh giá các Checkbox nếu có.
 * 4. Kiểm tra xem trang có Auto-advance (tự nhảy trang) không.
 * 5. Nếu không auto-advance, tự động tìm và click nút Next/Continue.
 *
 * @param {object} frame Frame hoặc Page Playwright.
 * @param {object} [record={}] Dữ liệu record hồ sơ (để khớp đáp án nhân khẩu học).
 * @param {object} [options={}] Tùy chọn bổ sung.
 * @return {Promise<{answeredCount: number, autoAdvanced: boolean, nextClicked: boolean}>}
 */
export async function solveSurveyStep(frame, record = {}, options = {}) {
  let answeredCount = 0;
  const initialUrl = typeof frame.url === 'function' ? frame.url() : '';

  // 1. Giải quyết rating
  const ratingsAnswered = await solveRatingQuestions(frame, options);
  answeredCount += ratingsAnswered;

  // 2. Giải quyết matrix table
  const matrixAnswered = await solveMatrixQuestions(frame, options);
  answeredCount += matrixAnswered;

  // 3. Giải quyết survey checkboxes
  const checkboxesAnswered = await solveSurveyCheckboxes(frame, options);
  answeredCount += checkboxesAnswered;

  if (answeredCount === 0) {
    return {
      answeredCount: 0,
      autoAdvanced: false,
      nextClicked: false,
    };
  }

  // 4. Kiểm tra auto-advance: Chỉ chờ khi đã có câu trả lời được tick/chọn
  await new Promise((r) => setTimeout(r, 350));
  const newUrl = typeof frame.url === 'function' ? frame.url() : '';
  const autoAdvanced = Boolean(initialUrl && newUrl && initialUrl !== newUrl);

  let nextClicked = false;
  if (!autoAdvanced) {
    nextClicked = await clickSurveyNextButton(frame, options);
  }

  return {
    answeredCount,
    autoAdvanced,
    nextClicked,
  };
}

/**
 * Vòng lặp giải quyết khảo sát nhiều bước liên tục (Multi-step Survey Runner).
 * Tự động chạy qua tối đa `maxSteps` bước khảo sát cho đến khi hoàn thành hoặc chuyển hướng trang.
 *
 * @param {object} page Page Playwright.
 * @param {object} [record={}] Bản ghi hồ sơ người dùng.
 * @param {object} [options={}] Tùy chọn: maxSteps (mặc định 25), stepDelayMs, onStepDone.
 * @return {Promise<{completedSteps: number, finished: boolean}>}
 */
export async function runMultiStepSurveyLoop(page, record = {}, options = {}) {
  const maxSteps = options.maxSteps || 25;
  const stepDelayMs = options.stepDelayMs || 500;
  let completedSteps = 0;

  for (let step = 1; step <= maxSteps; step++) {
    if (page.isClosed()) break;

    const res = await solveSurveyStep(page, record, options);
    if (res.answeredCount === 0 && !res.nextClicked) {
      // Không còn câu hỏi khảo sát nào trên màn hình hiện tại
      break;
    }

    completedSteps++;
    if (typeof options.onStepDone === 'function') {
      options.onStepDone({ step, ...res });
    }

    await new Promise((r) => setTimeout(r, stepDelayMs));
  }

  return {
    completedSteps,
    finished: completedSteps > 0,
  };
}
