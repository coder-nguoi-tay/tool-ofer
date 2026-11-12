import { handleYesNoStep } from './handle-yes-no-step.mjs';
import { readQuestionState, didQuestionAdvance } from '../survey-solver/verification/read-question-state.mjs';
import { inspectSubmitErrors } from './form-scope/inspect-submit-errors.mjs';
import { isControlInActiveForm } from './form-scope/is-control-in-active-form.mjs';
import { resolveActiveFormScope } from './form-scope/resolve-active-form-scope.mjs';
import { scrollToFormControl } from './form-scope/scroll-to-form-control.mjs';
import { submitVisibleFormFallback } from './submit-visible-form-fallback.mjs';
import { addActionCount } from './add-action-count.mjs';
import { findSubmitButton } from './find-submit-button.mjs';
import { hasActiveAddressSuggestions } from './has-active-address-suggestions.mjs';
import { humanClick } from './human-click.mjs';
import { humanMouseMove } from './human-mouse-move.mjs';
import { inspectAndFixFormWithAi } from '../../ai-assist.mjs';
import { rotateRejectedFormData } from './rotate-rejected-form-data.mjs';
import { selectFirstAddressSuggestion } from './select-first-address-suggestion.mjs';

/**
 * Gửi form của frame, theo dõi chuyển màn và kích hoạt kiểm tra lead sau email.
 * @param {object} context Trường hoặc frame đang xử lý cùng dữ liệu và tiến độ của lượt quét.
 * @return {Promise<boolean>} True khi cần dừng lượt quét trang.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function submitFrameForm({
  options,
  frame,
  page,
  session,
  frameProgress,
  record,
  screenInfo,
  scanStartUrl
}) {
  if (options.autoSubmit !== false) {
    const yesNo = await handleYesNoStep({ frame, page, options });
    if (yesNo.waitingForInput) return false;
    if (yesNo.handled) {
      if (yesNo.actions) { addActionCount(session, yesNo.actions); session.lastActionTime = Date.now(); }
      return false;
    }
    try {
      const formScope = frameProgress.formScope ?? await resolveActiveFormScope(frame);
      const submitBtn = await findSubmitButton(frame, formScope);
      if (submitBtn) {
        const btnInfo = await submitBtn.evaluate((btn, currentFields) => {
          const text = (btn.innerText || btn.value || btn.textContent || '').trim().slice(0, 80);
          const tag = (btn.tagName || '').toUpperCase();
          const id = btn.id || null;
          const className = String(btn.className || '');
          const now = Date.now();
          const lastClick = Number(btn.dataset.uxLastSubmitTime || 0);
          let clickCount = Number(btn.dataset.uxSubmitCount || 0);
          const lastFields = Number(btn.dataset.uxLastFields || -1);

          // Chỉ reset khi có tiến triển ở màn mới; tính trước lần tăng bộ đếm hành động do submit bên dưới.
          if (currentFields > lastFields && lastFields !== -1) {
            clickCount = 0;
          }

          // 1. Thẻ <a> chuyển link / popup: chỉ bấm 1 lần nếu mở ra tab mới ngoài (_blank)
          const isExternalNav = tag === 'A' && btn.href && !btn.href.startsWith('javascript:') && !btn.href.startsWith('#') && btn.target === '_blank';
          if (isExternalNav && btn.dataset.uxSubmitted === '1') {
            return {
              shouldClick: false,
              text,
              tag,
              id,
              className,
              reason: 'a_already_clicked'
            };
          }

          // 2. Chống duplicate submit dồn dập: thời gian cooldown 1200ms
          if (now - lastClick < 1200) {
            return {
              shouldClick: false,
              text,
              tag,
              id,
              className,
              reason: 'cooldown'
            };
          }

          // 3. Giới hạn click: cho phép tối đa 10 lần cho mỗi nút trên cùng 1 trang (hỗ trợ multi-step forms)
          if (clickCount >= 10) {
            return {
              shouldClick: false,
              text,
              tag,
              id,
              className,
              reason: 'max_clicks_reached'
            };
          }
          btn.dataset.uxLastSubmitTime = String(now);

          return {
            shouldClick: true,
            text,
            tag,
            id,
            className,
            clickCount: clickCount + 1
          };
        }, (session.autofillFields ?? 0) + (session.autofillActions ?? 0)).catch(() => null);
        if (btnInfo?.shouldClick) {
          // BẢO VỆ CHỐNG BẤM SUBMIT KHI DROPDOWN GỢI Ý ĐỊA CHỈ ĐANG MỞ:
          // Nếu trang web vừa mở dropdown gợi ý địa chỉ từ API, BẮT BUỘC PHẢI CHỌN GỢI Ý ĐẦU TIÊN TRƯỚC
          // rồi mới cho phép Submit, tránh form bị từ chối do chưa chọn địa chỉ từ danh sách gợi ý!
          try {
            const hasOpenSuggestions = await hasActiveAddressSuggestions(page, frame);
            if (hasOpenSuggestions) {
              console.log('[Autofill] Phát hiện dropdown gợi ý địa chỉ đang mở; tự động chọn gợi ý trước khi bấm submit...');
              await selectFirstAddressSuggestion(page, frame, null, options);
              if (page && typeof page.waitForTimeout === 'function') {
                await page.waitForTimeout(350).catch(() => {});
              } else {
                await new Promise(r => setTimeout(r, 350));
              }
            }
          } catch {}
          // Dừng ngắn quan sát trước khi nộp (pre-submit hesitation):
          // Nếu là trình duyệt thật (có mouse CDP), dừng 320ms - 550ms như người thật kiểm tra lại form;
          // Nếu là môi trường unit test (không có mouse), dừng 35ms - 55ms để vượt qua timeout test.
          const isRealBrowser = Boolean(page?.mouse && typeof page.mouse.move === 'function');
          const reviewPause = isRealBrowser ? Math.floor(Math.random() * 230) + 320 : Math.floor(Math.random() * 20) + 35;
          await new Promise(resolve => {
            setTimeout(resolve, reviewPause);
          });

          // Cuộn phần tử vào tầm nhìn
          await scrollToFormControl(submitBtn);

          // Trên trình duyệt thật: di chuyển chuột Bézier tới nút và hover 140ms - 260ms trước khi nhấn
          if (isRealBrowser && typeof submitBtn.boundingBox === 'function') {
            const box = await submitBtn.boundingBox().catch(() => null);
            if (box && box.width > 0 && box.height > 0) {
              const targetX = box.x + box.width * (0.3 + 0.4 * Math.random());
              const targetY = box.y + box.height * (0.3 + 0.4 * Math.random());
              await humanMouseMove(page, targetX, targetY);
              await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 120) + 140));
            }
          }
          // Nút có thể đã ẩn/disabled trong lúc chờ hoặc hover sau khi form tự gửi.
          if (!(await submitBtn.isVisible().catch(() => false))) return false;
          if (typeof submitBtn.isEnabled === 'function' && !(await submitBtn.isEnabled().catch(() => false))) return false;
          const submitStillReady = await submitBtn.evaluate(button => {
            for (let parent = button; parent; parent = parent.parentElement) {
              if (parent.getAttribute('aria-busy') === 'true' || parent.getAttribute('aria-disabled') === 'true' || parent.hasAttribute('inert') || button.ownerDocument.defaultView.getComputedStyle(parent).opacity === '0') return false;
            }
            return true;
          }).catch(() => false);
          if (!submitStillReady) return false;

          const submitLabel = btnInfo.text || btnInfo.id || 'Submit';
          console.log(`[Autofill] Bấm nút submit: <${btnInfo.tag}> "${submitLabel}" id="${btnInfo.id}" class="${btnInfo.className || ''}"`);

          // Ghi log submit rõ ràng vào session logs
          options.onLog?.({
            type: 'submit_attempt',
            tag: btnInfo.tag,
            id: btnInfo.id,
            className: btnInfo.className || null,
            text: submitLabel,
            detail: `Đang thử bấm nút submit/tiếp tục: <${btnInfo.tag}> "${submitLabel}" id="${btnInfo.id || '?'}" class="${btnInfo.className || '?'}"`
          }, page);

          if (formScope && !await submitBtn.evaluate(isControlInActiveForm, formScope).catch(() => false)) return false;

          const isFirstSubmitOfSession = !session.firstSubmitHandled && !session.screen1Completed;
          const initialUrl = session.initialFormUrl || page.url();
          let openedPopup = null;
          const popupHandler = popup => {
            openedPopup = popup;
          };
          if (isFirstSubmitOfSession && typeof page.once === 'function') {
            page.once('popup', popupHandler);
          }

          // Thao tác click tự nhiên bằng humanClick (Bézier curves + CDP mouse events)
          const beforeSubmitState = await readQuestionState(frame);
          const clickStartedAt = Date.now();
          let submitDispatched = await humanClick(page, submitBtn);
          if (!submitDispatched) {
            submitDispatched = await submitBtn.click({ timeout: 2000 }).then(() => true).catch(() => false);
          }
          // Website chặn ngay bằng alert lỗi nhập liệu ("Please enter a birthday…"): không tính là đã submit/tiến triển.
          // Trước đây mỗi lần vẫn cộng action nên watcher bấm Continue lặp mãi (log 2026-11-12: 54 lần).
          const rejectedDialog = submitDispatched && page._uxLastDialog?.validation && page._uxLastDialog.at >= clickStartedAt ? page._uxLastDialog : null;
          if (rejectedDialog) {
            page.off?.('popup', popupHandler);
            options.onLog?.({ type: 'submit_rejected_dialog', id: btnInfo.id, detail: `Website chặn ${submitLabel} bằng thông báo: "${rejectedDialog.message.slice(0, 120)}"; không tính là tiến triển.` }, page);
            return false;
          }
          if (!submitDispatched) {
            page.off?.('popup', popupHandler);
            options.onLog?.({ type: 'submit_click_failed', id: btnInfo.id, detail: `Không click được ${submitLabel}; chưa ghi nhận submit.` }, page);
            return false;
          }
          await submitBtn.evaluate((button, { progress, count }) => {
            button.dataset.uxSubmitted = '1';
            button.dataset.uxSubmitCount = String(count);
            button.dataset.uxLastFields = String(progress + 1);
          // timeout ngắn: click thường làm trang chuyển đi, Locator nút cũ không còn — không có timeout thì
          // Playwright chờ mặc định 30s và chặn cả vòng autofill (log 2026-11-12: "Return to Financial Help Finder").
          }, { progress: (session.autofillFields ?? 0) + (session.autofillActions ?? 0), count: btnInfo.clickCount }, { timeout: 500 }).catch(() => {});
          options.onLog?.({ type: 'submit_clicked', id: btnInfo.id, text: submitLabel, detail: `Đã dispatch submit: ${submitLabel}; chờ website xác nhận.` }, page);
          session.lastActionTime = Date.now();
          addActionCount(session, 1);

          // Xử lý đặc thù màn đầu nếu có tab quảng cáo mở ra ngoài
          if (isFirstSubmitOfSession) {
            session.firstSubmitHandled = true;
            // Chờ ngắn 200ms để bắt popup (nếu trang web cố bật tab quảng cáo)
            await new Promise(resolve => setTimeout(resolve, 200));
            page.off?.('popup', popupHandler);

            // 1. Tắt tab popup quảng cáo mở không đúng (nếu có)
            if (openedPopup && !openedPopup.isClosed()) {
              console.log(`[Autofill] Phát hiện tab mới bật lên (${openedPopup.url()}) sau submit lần 1. Đang tắt tab này...`);
              options.onLog?.({
                type: 'first_submit_popup_closed',
                detail: `Đã tắt tab mở không đúng (${openedPopup.url()}) sau lần submit đầu.`
              });
              openedPopup._uxClosedByApp = 'đóng popup';
              await openedPopup.close().catch(() => {});
            }

            // 2. Chỉ khôi phục về initialUrl nếu trang chính bị đẩy sang URL quảng cáo rác trắng trợn
            const currentUrl = page.url();
            const isSpamAdRedirect = /doubleclick\.net|googleadservices|popads|about:blank/i.test(currentUrl);
            if (isSpamAdRedirect) {
              console.log(`[Autofill] Trang bị đẩy sang URL quảng cáo không đúng: [${currentUrl}]. Đang mở lại trang đầu [${initialUrl}]...`);
              try {
                await page.goto(initialUrl, {
                  waitUntil: 'domcontentloaded',
                  timeout: 30000
                });
              } catch (gotoErr) {
                console.warn('[Autofill] Lỗi khi mở lại trang đầu:', gotoErr.message);
              }
            }
          }

          // Sau khi click submit: kiểm tra xem form có bị trang web chặn do lỗi validation không
          const afterSubmitState = await readQuestionState(frame);
          const stepAdvanced = didQuestionAdvance(beforeSubmitState, afterSubmitState);
          let submitError = null;
          try {
            if (!page.isClosed() && !stepAdvanced) {
              submitError = await frame.evaluate(inspectSubmitErrors, formScope).catch(() => null);
            }
          } catch {}

          // Form từ chối email/thông tin đã điền (lặp lại ≥ 2 lần): đổi email/record mới, bỏ dữ liệu cũ vào danh sách bị từ chối.
          // Không có thông báo lỗi nhưng bấm submit màn email ≥ 3 lần vẫn đứng yên: coi như email bị từ chối.
          const stuckOnEmail = !submitError?.hasError && frameProgress.frameHasEmail && session.emailFilled && (btnInfo?.clickCount || 0) >= 3;
          const rejectInfo = stuckOnEmail ? {
            hasError: true,
            firstError: `bấm submit ${btnInfo.clickCount} lần vẫn đứng ở màn email`,
            fieldType: 'email',
            fieldValue: session.assignedEmail || record?.email || 'email'
          } : submitError;
          if (rejectInfo?.hasError && (await rotateRejectedFormData(frame, record, session, options, rejectInfo))) {
            session.hasSubmittedCurrentScreen = false;
            return true;
          }
          if (submitError?.hasError) {
            console.log(`[Autofill] Submit chưa qua được do trang báo lỗi: ${submitError.firstError}. Đang gọi AI chẩn đoán và tự sửa lỗi...`);
            const fieldIdentity = submitError.fieldId || submitError.fieldName ? `${submitError.fieldTag || 'field'}#${submitError.fieldId || submitError.fieldName} class="${submitError.fieldClass || '?'}" container="${submitError.fieldContainerClass || '?'}"` : 'không rõ trường';
            console.log(`[Autofill] Phần tử lỗi: ${fieldIdentity} — nút submit: <${btnInfo?.tag || '?'}> id="${btnInfo?.id || '?'}" class="${btnInfo?.className || '?'}"`);
            options.onLog?.({
              type: 'submit_rejected_with_error',
              // Định danh đầy đủ của nút submit và trường lỗi để phân tích nâng cấp matcher
              detail: `Form chưa gửi được do có lỗi validation: ${submitError.firstError}. Trigger: <${btnInfo?.tag || '?'}> id="${btnInfo?.id || '?'}" class="${btnInfo?.className || '?'}". Field lỗi: ${fieldIdentity}. Đang kích hoạt AI chẩn đoán và sửa lỗi.`,
              submitButton: {
                tag: btnInfo?.tag || null,
                id: btnInfo?.id || null,
                className: btnInfo?.className || null,
                text: btnInfo?.text || null
              },
              failingField: {
                tag: submitError.fieldTag || null,
                id: submitError.fieldId || null,
                name: submitError.fieldName || null,
                className: submitError.fieldClass || null,
                containerClass: submitError.fieldContainerClass || null
              }
            });
            session.hasSubmittedCurrentScreen = false;
            void inspectAndFixFormWithAi(page, record, session, options);
            return true;
          }
          session.hasSubmittedCurrentScreen = true;
          const isFirstClickOnThisScreen = !btnInfo?.clickCount || btnInfo.clickCount <= 1;
          if (isFirstClickOnThisScreen) {
            if (!session.completedScreens || session.completedScreens < 1) {
              session.completedScreens = 1;
              session.currentScreen = 2;
              session.pageJumps = Math.max(session.pageJumps || 0, session.completedScreens);
              session.screenReached = Math.max(session.screenReached || 1, session.currentScreen);
              options.onScreenAdvanced?.(session, session.currentScreen, session.pageJumps);
            }
          }

          // Kiểm tra xem màn vừa submit có phải là màn điền email hay không
          const wasEmailScreenSubmit = frameProgress.frameHasEmail || session.screenHasEmail || screenInfo?.hasEmailInput || session.emailFilled && !session.emailScreenSubmitted;
          if (wasEmailScreenSubmit) {
            session.emailScreenSubmitted = true;
            session.emailSubmitUrl = scanStartUrl;
            session.screenHasEmail = false;
            session.emailScreenNumber = session.completedScreens;
          }

          // Không check lead ngay sau khi bấm submit: lượt quét kế tiếp chỉ check khi đã thật sự qua màn email.

          // Kích hoạt quét tiếp theo sau 120ms để màn hình thao tác liên tục không nghỉ
        }
      } else if (frameProgress.filledInThisPass > 0) {
        // FALLBACK NẾU THIẾU NÚT BẤM HOẶC NÚT BẤM KHÔNG ĐƯỢC NHẬN DIỆN:
        // Chỉ chạy khi TRONG LƯỢT QUÉT NÀY vừa điền thêm được ô mới.
        // Trả về định danh phần tử đã gửi (id/class của div/button/form) để log nâng cấp matcher.
        const formSubmitted = await frame.evaluate(submitVisibleFormFallback, formScope).catch(() => ({
          method: 'error'
        }));
        if (formSubmitted && formSubmitted.method !== 'none' && formSubmitted.method !== 'error') {
          const fallbackIdentity = formSubmitted.id || formSubmitted.className ? `${formSubmitted.tag || 'element'}#${formSubmitted.id || '?'} class="${formSubmitted.className || '?'}"` : 'không rõ định danh';
          console.log(`[Autofill] Không có nút submit chuẩn, đã kích hoạt fallback (${formSubmitted.method}) trên: ${fallbackIdentity}.`);
          options.onLog?.({
            type: 'submit_fallback',
            detail: `Đã tự động gửi form qua ${formSubmitted.method} dự phòng khi không tìm thấy nút submit. Phần tử: ${fallbackIdentity}.`,
            method: formSubmitted.method,
            element: {
              tag: formSubmitted.tag || null,
              id: formSubmitted.id || null,
              className: formSubmitted.className || null
            }
          });
          session.lastActionTime = Date.now();
          addActionCount(session, 1);
          session.hasSubmittedCurrentScreen = true;
          if (!session.completedScreens || session.completedScreens < 1) {
            session.completedScreens = 1;
            session.currentScreen = 2;
            session.pageJumps = Math.max(session.pageJumps || 0, session.completedScreens);
            session.screenReached = Math.max(session.screenReached || 1, session.currentScreen);
            options.onScreenAdvanced?.(session, session.currentScreen, session.pageJumps);
          }
          const wasEmailScreenFallback = frameProgress.frameHasEmail || session.screenHasEmail || screenInfo?.hasEmailInput || session.emailFilled && !session.emailScreenSubmitted;
          if (wasEmailScreenFallback) {
            session.emailScreenSubmitted = true;
            session.emailSubmitUrl = scanStartUrl;
            session.screenHasEmail = false;
            session.emailScreenNumber = session.completedScreens;
          }
          setTimeout(() => {
            session.triggerAutofillScan?.();
          }, 200);
        }
      }
    } catch (submitErr) {
      console.error('[Autofill] Lỗi trong quá trình xử lý submit:', submitErr.message);
    }
  }
  return false;
}
