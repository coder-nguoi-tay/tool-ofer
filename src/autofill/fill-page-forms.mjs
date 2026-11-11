import { isLeadWaitEnabled } from './is-lead-wait-enabled.mjs';
import { shouldPauseForLead } from './should-pause-for-lead.mjs';
import { selectPageFormFrames } from './form-scope/select-page-form-frames.mjs';
import { configurePageMousePolicy } from './interaction/configure-page-mouse-policy.mjs';
import { rescueRequiredField } from './form-scope/rescue-required-field.mjs';
import { resolveActiveFormScope } from './form-scope/resolve-active-form-scope.mjs';
import { locateFormElements } from './form-scope/locate-form-elements.mjs';
import { protectConfirmedLeadSession } from '../leads/actions/protect-confirmed-lead-session.mjs';
import { trackFrameScreen } from './track-frame-screen.mjs';
import { completeFrameControls } from './complete-frame-controls.mjs';
import { fillFrameFields } from './fill-frame-fields.mjs';
import { processFrameSurveys } from './process-frame-surveys.mjs';
import { inspectFrameScreen } from './inspect-frame-screen.mjs';
import { inspectFrameValidation } from './inspect-frame-validation.mjs';
import { submitFrameForm } from './submit-frame-form.mjs';
import { addVerifiedFieldCount } from './add-verified-field-count.mjs';
import { getNormalizedPhone } from './get-normalized-phone.mjs';
import { humanType } from './human-type.mjs';
import { humanWheelScroll } from './human-wheel-scroll.mjs';
import { naturalMouseDrift } from './natural-mouse-drift.mjs';
import { pageHasVisibleFilledEmail } from './page-has-visible-filled-email.mjs';

/**
 * Điều phối quét form trên trang và các frame con theo dữ liệu của phiên.
 * @param {object} page Tab cần xử lý.
 * @param {object} context Dữ liệu phiên và callback điều phối được giữ bởi attachAutofill.
 * @return {Promise<void>} Hoàn tất thao tác trên tab.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function fillPageForms(page, {
  session,
  sessionRecord,
  options,
  triggerLeadCheckAfterEmail
}) {
  configurePageMousePolicy(page, session);
  protectConfirmedLeadSession(session);
  if (page.isClosed() || page._leadRecoveryInProgress || ['manual','skip'].includes(session.offerMode)) return;
  const frames = await selectPageFormFrames(page);
  // Không lấy effectiveRecords[...] (mảng dùng chung giữa các slot): dòng dưới gắn email phiên vào record.
  const record = page._assignedRecord || session.currentRecord || sessionRecord;
  // Record của tab lấy riêng từ hàng đợi nên chưa có email của phiên: gắn vào để mọi nhánh điền (kể cả điền cứu trợ, AI) dùng đúng email.
  if (record && session.assignedEmail && record.assignedEmail !== session.assignedEmail) {
    Object.assign(record, {
      email: session.assignedEmail,
      emailaddress: session.assignedEmail,
      mail: session.assignedEmail,
      assignedEmail: session.assignedEmail
    });
  }
  const hasRecordData = record && typeof record === 'object' && Object.keys(record).filter(k => record[k]).length > 0;
  if (!hasRecordData && !page._uxRecordEmptyLogged) {
    page._uxRecordEmptyLogged = true;
    options.onLog?.({
      type: 'record_pool_empty',
      detail: `[Scan] CẢNH BÁO: Record rỗng — không có dữ liệu để điền form! Kiểm tra hàng đợi record (tab Proxy).`
    });
  }
  if (session.offerMode === 'consent_only') {
    for (const frame of frames) {
      const boxes = await locateFormElements(frame, 'input[type="checkbox"]').all().catch(() => []);
      for (const box of boxes) {
        const consent = await box.evaluate(el => {
          const label = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
          return /consent|terms|privacy|agree|tcpa|disclosure|policy/i.test(`${el.name || ''} ${el.id || ''} ${label?.textContent || ''}`);
        }).catch(() => false);
        if (consent && (await box.isVisible().catch(() => false)) && !(await box.isChecked().catch(() => true))) {
          await box.check({
            timeout: 1500
          }).catch(() => {});
        }
      }
    }
    return;
  }
  if (shouldPauseForLead(session, options)) return;

  // PHÁT HIỆN EMAIL ĐIỀN NGOÀI (RoboForm/extension/tay) — nếu các cờ thường không bắt được,
  // quét nhanh các ô email hiển thị có giá trị trong page + frame con để bật cờ emailFilled,
  // nếu không guard "chưa điền email" sẽ chặn vĩnh viễn việc check lead.
  const hasVisibleFilledEmail = () => pageHasVisibleFilledEmail(page);
  if (!session.emailFilled) {
    if (await hasVisibleFilledEmail()) {
      session.emailFilled = true;
      session.emailFillAt = session.emailFillAt || Date.now();
      session.emailScreenNumber = session.emailScreenNumber || session.completedScreens || 1;
      session.screenHasEmail = true;
      console.log(`[Autofill] Phát hiện email đã có sẵn trong form (RoboForm/extension/tay). Đánh dấu emailFilled=true để luồng check lead hoạt động.`);
      options.onLog?.({
        type: 'email_filled_external',
        detail: 'Phát hiện email đã có sẵn trong form (extension/tay) — bật cờ emailFilled để check lead.'
      });
    }
  }

  // Nếu đang trong quá trình kiểm tra lead mà chưa xác nhận: tạm dừng không thao tác
  if (isLeadWaitEnabled(session, options) && !session.screen5LeadVerified) {
    if (session.screen5LeadCheckTriggered || session.leadCheckTriggered) {
      return;
    }
    // AI assist và nhánh quét giá trị có sẵn chỉ bật emailFilled, không ghi emailFillAt:
    // bắt đầu đếm từ lần đầu thấy cờ, nếu không nhánh bảo hiểm bên dưới không bao giờ chạy.
    if (session.emailFilled && !session.emailFillAt) session.emailFillAt = Date.now();
    // Chỉ check lead khi đã NHẢY QUA màn email, không phải chỉ điền/bấm submit: form còn lỗi (zip/tuổi sai)
    // thì vẫn đứng ở màn email, check lúc này sẽ dừng autofill mà không bao giờ có lead.
    // "Đã qua" = ô email đã biến mất khỏi màn, hoặc URL đã khác URL lúc bấm submit màn email.
    const passedEmailScreen = async () => !(await hasVisibleFilledEmail()) || Boolean(session.emailSubmitUrl && page.url() !== session.emailSubmitUrl);
    if (session.emailFilled
    // Đã bấm submit màn email, hoặc (AI bấm / Gravity Forms chuyển bước bằng AJAX) đã điền email quá 8s.
    && (session.emailScreenSubmitted || Date.now() - session.emailFillAt > 8000) && (await passedEmailScreen())) {
      triggerLeadCheckAfterEmail(page);
      return;
    }
  }
  const currentUrl = page.url();
  const scanStartUrl = currentUrl; // URL lúc bắt đầu lượt quét (trước mọi click submit), dùng để biết đã qua màn email chưa
  if (!currentUrl || currentUrl.startsWith('about:') || currentUrl.startsWith('chrome:') || currentUrl.startsWith('chrome-error:')) return;
  if (!session.initialFormUrl) {
    session.initialFormUrl = currentUrl;
  }

  // Tự nhiên hóa nhịp độ quan sát trang khi vừa chuyển sang URL mới (trên trình duyệt thật):
  const isRealBrowser = Boolean(page?.mouse && typeof page.mouse.move === 'function');
  if (session.lastObservedUrl && session.lastObservedUrl !== currentUrl) {
    session.pageJumps = (session.pageJumps || 0) + 1;
    session.screenReached = Math.max(session.screenReached || 1, (session.completedScreens || 0) + 1);
    options.onPageJump?.(session, session.pageJumps, currentUrl);
  }
  if (isRealBrowser && session.lastObservedUrl !== currentUrl) {
    session.lastObservedUrl = currentUrl;
    const observationPause = Math.floor(Math.random() * 300) + 350; // 350ms - 650ms
    await new Promise(r => setTimeout(r, observationPause));
    // Cuộn nhẹ xem lướt qua trang và vi chuyển động chuột tự nhiên
    try {
      if (!frames.some(frame => frame._activeAutofillFormScope)) await humanWheelScroll(page, Math.floor(Math.random() * 80) + 120);
      await naturalMouseDrift(page, 1);
    } catch {}
  } else {
    session.lastObservedUrl = currentUrl;
  }
  const unmatchedFieldNames = new Set();
  const scanProgress = {
    visibleFieldCount: 0
  };
  for (const frame of frames) {
    if (shouldPauseForLead(session, options)) return;

    // Frame không phản hồi (iframe quảng cáo đang tải dở, bị chặn hoặc đứng) làm frame.evaluate chờ vô hạn,
    // kéo theo cả lượt quét kẹt và tab không bao giờ được điền tiếp. Hỏi thăm có giới hạn, không trả lời thì bỏ qua.
    if (frame !== page && typeof frame.evaluate === 'function') {
      session.autofillStep = `kiểm tra frame ${typeof frame.url === 'function' ? frame.url().split(/[?#]/)[0] : ''}`;
      const responsive = await Promise.race([frame.evaluate(() => true).catch(() => false), new Promise(resolve => setTimeout(() => resolve(false), 3000))]);
      if (!responsive) continue;
    }
    session.autofillStep = `điền frame ${typeof frame.url === 'function' ? frame.url().split(/[?#]/)[0] : ''}`;
    const frameProgress = {
      filledInThisPass: 0,
      frameHasEmail: false,
      formScope: await resolveActiveFormScope(frame)
    };

    // Xử lý thẻ khảo sát co-reg "twy" (Yes/No random + điền subform + bấm Continue)
    // Chạy 1 lần mỗi ~2s mỗi frame để không spam click
    await processFrameSurveys({
      frame,
      record,
      options,
      page,
      session,
      frameProgress
    });
    if (frameProgress.widgetAdvanced) continue;
    let fields = [];
    try {
      frameProgress.formScope = await resolveActiveFormScope(frame);
      fields = await locateFormElements(frame, 'input, textarea, select', frameProgress.formScope).all();
    } catch {
      continue;
    }

    // Tự động xử lý Phone Modal nếu xuất hiện (đặc trưng trên 16.dlysurge.com & 16.gettngood.com)
    try {
      const phoneModalInput = locateFormElements(frame, '#update-phone-modal-input, input.update-phone-modal-input').first();
      if ((await phoneModalInput.count().catch(() => 0)) > 0 && (await phoneModalInput.isVisible().catch(() => false))) {
        const rawPhone = getNormalizedPhone(record);
        const area = rawPhone.slice(0, 3);
        const mid = rawPhone.slice(3, 6);
        const last = rawPhone.slice(6, 10);
        const formattedPhone = `(${area}) ${mid}-${last}`;
        await humanType(phoneModalInput, formattedPhone, page);
        const submitModalBtn = locateFormElements(frame, '#update-phone-modal-submit, button.update-phone-modal-submit').first();
        if ((await submitModalBtn.count().catch(() => 0)) > 0 && (await submitModalBtn.isVisible().catch(() => false))) {
          await submitModalBtn.click({
            force: true,
            timeout: 1500
          });
          frameProgress.filledInThisPass += 1;
          addVerifiedFieldCount(session, 1);
        }
      }
    } catch {}
    if (await fillFrameFields({
      fields,
      session,
      page,
      options,
      frameProgress,
      scanProgress,
      frame,
      record,
      unmatchedFieldNames
    })) return;
    if (await completeFrameControls({
      frameProgress,
      frame,
      record,
      session,
      options,
      page
    })) continue;
    const hasUnfilledRequiredOrErrorField = await frame.evaluate(inspectFrameValidation, frameProgress.formScope).catch(() => ({
      unfilled: false
    }));

    // Nhận diện loại màn hình hiện tại (Màn 5 DOB/Gender, Jump Page, màn có ô email, v.v.)
    const screenInfo = await frame.evaluate(inspectFrameScreen, frameProgress.formScope).catch(() => null);
    if (await trackFrameScreen({
      screenInfo,
      frameProgress,
      session,
      options,
      page,
      frame
    })) return;
    let rescueSucceeded = false;
    if (hasUnfilledRequiredOrErrorField?.unfilled) {
      console.log(`[Autofill] Phát hiện trường bắt buộc chưa điền hoặc bị lỗi: ${hasUnfilledRequiredOrErrorField.id} (${hasUnfilledRequiredOrErrorField.type}, class="${hasUnfilledRequiredOrErrorField.className || '?'}", container="${hasUnfilledRequiredOrErrorField.containerClass || '?'}"). Đang thử điền cứu trợ...`);
      try {
        const rescueFilled = await rescueRequiredField({ frame, page, fieldInfo: hasUnfilledRequiredOrErrorField, record, session, formScope: frameProgress.formScope, options }).catch(() => false);
        if (rescueFilled === true) {
          addVerifiedFieldCount(session, 1);
          frameProgress.filledInThisPass += 1;
          rescueSucceeded = true;
          if (/email/i.test(hasUnfilledRequiredOrErrorField.id || hasUnfilledRequiredOrErrorField.type)) {
            session.emailFilled = true;
          }
        }
      } catch {}
    }

    // Kiểm tra xem trường lỗi có phải là trường tùy chọn hay không
    const isOptionalField = hasUnfilledRequiredOrErrorField?.id && /apt|suite|unit|address2|street2|secondary|middle|comments|notes|ext\b|optional/i.test(hasUnfilledRequiredOrErrorField.id);

    // Cho thư viện autofill hoàn tất lượt thử trước; watchdog mới chuyển sang AI nếu vẫn kẹt.
    const isUnfilledEmailOrFatalError = hasUnfilledRequiredOrErrorField?.unfilled && !rescueSucceeded && !isOptionalField;
    if (isUnfilledEmailOrFatalError) {
      const fieldSignature = `${hasUnfilledRequiredOrErrorField.id || hasUnfilledRequiredOrErrorField.type}:${hasUnfilledRequiredOrErrorField.reason || 'unfilled'}`;
      const failingFieldIdentity = `${hasUnfilledRequiredOrErrorField.id || '?'} (type=${hasUnfilledRequiredOrErrorField.type || '?'}, reason=${hasUnfilledRequiredOrErrorField.reason || '?'}, class="${hasUnfilledRequiredOrErrorField.className || '?'}", container="${hasUnfilledRequiredOrErrorField.containerClass || '?'}")`;
      session.autofillError = `Thư viện chưa điền được trường ${hasUnfilledRequiredOrErrorField.id || hasUnfilledRequiredOrErrorField.type}.`;
      if (page._lastAutofillUnresolvedField !== fieldSignature) {
        page._lastAutofillUnresolvedField = fieldSignature;
        console.log(`[Autofill] Thư viện đã thử điền nhưng trường vẫn chưa hợp lệ: ${failingFieldIdentity}. Chặn submit và để watchdog chuyển AI sau lượt thử đầu.`);
        options.onLog?.({
          type: 'autofill_library_incomplete',
          detail: `Thư viện autofill chưa xử lý được trường [${hasUnfilledRequiredOrErrorField.id || hasUnfilledRequiredOrErrorField.type}] class="${hasUnfilledRequiredOrErrorField.className || '?'}" container="${hasUnfilledRequiredOrErrorField.containerClass || '?'}" reason=${hasUnfilledRequiredOrErrorField.reason || '?'}. Chặn submit; sẽ chuyển sang AI sau thời gian thử tự điền.`,
          failingField: {
            id: hasUnfilledRequiredOrErrorField.id || null,
            type: hasUnfilledRequiredOrErrorField.type || null,
            reason: hasUnfilledRequiredOrErrorField.reason || null,
            className: hasUnfilledRequiredOrErrorField.className || null,
            containerClass: hasUnfilledRequiredOrErrorField.containerClass || null
          }
        });
      }
      return;
    }
    if (await submitFrameForm({
      options,
      frame,
      page,
      session,
      frameProgress,
      record,
      screenInfo,
      scanStartUrl
    })) return;
  }
  if (session.autofillFields || session.autofillActions) return;
  if (unmatchedFieldNames.size) {
    session.autofillError = 'Không ô nào khớp tên cột. Ô trên trang: ' + [...unmatchedFieldNames].slice(0, 12).join(', ');
  } else if (!scanProgress.visibleFieldCount) {
    session.autofillError = 'Chưa phát hiện thấy form hoặc ô nhập nào trên trang.';
  }
}
