import { isLeadWaitEnabled } from './is-lead-wait-enabled.mjs';
import { configurePageMousePolicy } from './interaction/configure-page-mouse-policy.mjs';
import { protectConfirmedLeadSession } from '../leads/actions/protect-confirmed-lead-session.mjs';
import { attachAutofillPageWatcher } from './attach-autofill-page-watcher.mjs';
import { fillPageForms } from './fill-page-forms.mjs';
import { pageHasVisibleFilledEmail } from './page-has-visible-filled-email.mjs';

/**
 * Gắn con trỏ cho mọi tab rồi điều phối tự điền, gửi form và kiểm tra kết quả cho phiên.
 * @param {object} context context.
 * @param {object} records records.
 * @param {*} allowedOrigin allowed origin.
 * @param {object} session session.
 * @param {object} options options.
 * @return {void} Kết quả xử lý attach autofill.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
function attachAutofill(context, records, allowedOrigin, session = {}, options = {}) {
  protectConfirmedLeadSession(session);
  context.on('page', page => configurePageMousePolicy(page, session));
  for (const page of context.pages()) configurePageMousePolicy(page, session);
  // offerStrategy: { mode: 'auto_full' | 'consent_only' | 'manual' | 'skip', ... } từ offerStrategyState
  // Không tự tạo record mẫu: chỉ dùng record trong danh sách app cung cấp. Hết record thì dùng record rỗng
  // (không điền gì từ record) và báo log để người dùng nạp thêm dữ liệu.
  const hasRecords = Array.isArray(records) && records.length > 0;
  const effectiveRecords = hasRecords ? records : [{}];
  if (!hasRecords) {
    options.onLog?.({
      type: 'autofill_records_empty',
      detail: 'Hết record trong danh sách "Dữ liệu tự điền"; không tự tạo dữ liệu, hãy nạp thêm record.'
    });
  }
  const trackedPages = new WeakSet();

  // Giải quyết chiến lược giải offer cho phiên này (mặc định Cách 1 / auto_full).
  // offerMethod: 1-4 (Cách giải tương ứng với Offer 1-4), mode: auto_full | consent_only | manual | skip
  const strategy = options.offerStrategy || {};
  options = {
    ...options,
    autoSubmit: options.autoSubmit !== false && strategy.autoSubmit !== false,
    maxPick: Number.isInteger(Number(strategy.maxPick)) && Number(strategy.maxPick) > 0 ? Number(strategy.maxPick) : options.maxPick,
    // pickRandom: true = chọn ngẫu nhiên (mặc định giữ hành vi cũ);
    // false = chọn lần lượt đáp án checkbox hợp lệ, không trộn ngẫu nhiên.
    pickRandom: strategy.pickRandom !== false
  };
  const offerMethod = Number(strategy.offerMethod || strategy.methodNumber || 1);
  const offerMode = (strategy.mode || 'auto_full').toString();
  session.offerStrategy = strategy;

  // Ánh xạ Cách giải -> mode (nếu strategy chưa có mode):
  // Cách 1 = auto_full (điền toàn bộ form + submit), Cách 2 = consent_only (chỉ tick consent),
  // Cách 3 = manual (không tự động), Cách 4 = skip (bỏ qua offer).
  if (!strategy.mode) {
    const methodModeMap = {
      1: 'auto_full',
      2: 'consent_only',
      3: 'manual',
      4: 'skip'
    };
    const mappedMode = methodModeMap[offerMethod] || 'auto_full';
    session.offerMethod = offerMethod;
    session.offerMode = mappedMode;
  } else {
    session.offerMethod = offerMethod;
    session.offerMode = offerMode;
  }

  // Nếu chế độ 'skip': bỏ qua hoàn toàn, không khởi chạy autofill.
  if (session.offerMode === 'skip') {
    options.onLog?.({
      type: 'offer_skipped',
      detail: 'Offer bị bỏ qua theo Cách giải 4 (skip).'
    }, null);
    return;
  }

  // Nếu chế độ 'manual': không tự động điền form, chờ người thao tác thủ công.
  if (session.offerMode === 'manual') {
    options.onLog?.({
      type: 'offer_manual',
      detail: 'Offer chạy theo Cách giải 3 (thủ công). Đang chờ người thao tác...'
    }, null);
    return;
  }

  // Chọn 1 bản ghi duy nhất cho toàn bộ phiên này để nhất quán xuyên suốt các trang/bước/frame.
  // Chọn theo con trỏ xoay vòng (không random): tránh việc lượt sau điền lại đúng record
  // của lượt trước khi pool tái dùng (used) hoặc khi available được nạp lại toàn bộ.
  if (session.recordIndex === undefined || session.recordIndex < 0 || session.recordIndex >= effectiveRecords.length) {
    // Con trỏ chia sẻ trên chính mảng pool: nhiều session (các cửa sổ chạy song song) dùng chung
    // pool sẽ lần lượt lấy record khác nhau, không trùng cho tới khi đi hết vòng.
    const cursorKey = '__uxRecordCursor';
    if (!(cursorKey in effectiveRecords)) effectiveRecords.__uxRecordCursor = 0;
    session.recordIndex = effectiveRecords.__uxRecordCursor % effectiveRecords.length;
    effectiveRecords.__uxRecordCursor = session.recordIndex + 1;
  }
  // BẢO VỆ ĐA TRÌNH DUYỆT: clone bản ghi ra 1 object riêng cho phiên này.
  // Pool (effectiveRecords) là mảng DÙNG CHUNG giữa các slot chạy song song — nếu không clone,
  // mutation ghi email/session của slot này sẽ đè lên record mà slot khác đang dùng cùng lúc.
  const sourceRecord = effectiveRecords[session.recordIndex];
  const record = sourceRecord && typeof sourceRecord === 'object' ? JSON.parse(JSON.stringify(sourceRecord)) : sourceRecord;
  if (session.assignedEmail && record) {
    record.email = session.assignedEmail;
    record.emailaddress = session.assignedEmail;
    record.mail = session.assignedEmail;
    record.assignedEmail = session.assignedEmail;
  }
  session.autofillRecord = session.recordIndex + 1;
  options.onRecordPicked?.(record);
  // Bản sao riêng của phiên, dùng khi tab chưa có record riêng (fillVisibleForms che tên `record` bằng biến cục bộ).
  const sessionRecord = record;

  /**
   * Bật check lead cho phiên (dùng chung mọi tab): đặt cờ tạm dừng autofill rồi gọi app chờ lead.
   *
   * @param {object} page Tab vừa qua màn email.
   * @return {void}
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-12
   */
  function triggerLeadCheckAfterEmail(page) {
    if (!isLeadWaitEnabled(session, options) || protectConfirmedLeadSession(session) || session.leadCheckTriggered || session.screen5LeadCheckTriggered) return;
    session.screen5LeadCheckTriggered = true;
    session.leadCheckTriggered = true;
    session.leadCheckStatus = 'checking';
    session.leadCheckReason = 'screen_target';
    console.log(`[LeadCheck] Đã qua màn email (đã hoàn thành ${session.completedScreens || 0} màn). Bắt đầu tạm dừng và chờ kiểm tra lead...`);
    options.onLog?.({
      type: 'screen_target_lead_check',
      detail: `Đã qua màn email (hoàn thành ${session.completedScreens || 0} màn). Bắt đầu chờ đợi lead (1 lần x 20s)...`
    }, page);
    if (typeof options.onEmailSubmitted === 'function') {
      options.onEmailSubmitted(session, page);
    } else if (typeof options.onScreen5Reached === 'function') {
      options.onScreen5Reached(session, page);
    }
  }

  /**
   * Kiểm tra riêng từng tab, không phụ thuộc lượt autofill: lượt quét bỏ qua cả lượt khi AI đang chạy trên tab
   * hoặc lượt trước còn kẹt, nên tab 1 đã qua màn email vẫn không được check lead, phải đợi tab 2 điền email.
   * Tab đã từng thấy ô email có giá trị, sau đó ô email biến mất hoặc URL đổi → tab này đã qua màn email → check ngay.
   *
   * @param {object} page Tab cần kiểm tra.
   * @return {Promise<void>}
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-12
   */
  async function checkLeadAfterEmailOnPage(page) {
    if (protectConfirmedLeadSession(session) || !isLeadWaitEnabled(session, options) || session.screen5LeadVerified || page._uxLeadChecking || page.isClosed()) return;
    if (session.leadCheckTriggered || session.screen5LeadCheckTriggered || session.leadCheckStatus) return;
    page._uxLeadChecking = true;
    try {
      const url = page.url().split('#')[0];
      const emailVisible = await pageHasVisibleFilledEmail(page);
      if (emailVisible) {
        page._uxEmailSeenUrl = url;
        return;
      }
      if (!page._uxEmailSeenUrl || page.isClosed()) return;
      // Ô email còn trên màn nhưng rỗng (form từ chối, app xoá để gõ email khác) thì chưa qua màn.
      // Ô email vừa biến mất: chờ 1 nhịp rồi xem lại, tránh lúc trang đang vẽ lại chính màn email.
      if (await pageHasVisibleFilledEmail(page, {
        anyValue: true
      })) return;
      await new Promise(r => setTimeout(r, 700));
      if (page.isClosed() || (await pageHasVisibleFilledEmail(page, {
        anyValue: true
      }))) return;
      session.emailFilled = true;
      session.emailFillAt = session.emailFillAt || Date.now();
      session.emailScreenSubmitted = true;
      triggerLeadCheckAfterEmail(page);
    } catch {
      // Trang đang điều hướng / đóng: lần kiểm tra sau chạy lại.
    } finally {
      page._uxLeadChecking = false;
    }
  }

  /**
   * Điền các trường còn trống trên form đang hiển thị của một trang và các frame con.
   *
   * @param {object} page Trang Chrome cần xử lý.
   * @return {Promise<void>} Hoàn tất lượt quét form.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-10-21
   */
  async function fillVisibleForms(page) {
    return fillPageForms(page, {
      session,
      sessionRecord,
      options,
      triggerLeadCheckAfterEmail
    });
  }
  const isSpamAdUrl = (url = '') => {
    return /galaxystore\.samsung\.com|play\.google\.com\/store|apps\.apple\.com|popads|propellerads|clickadu|trafficjunky|zeroredirect|doubleclick\.net|syndication\.exoclick|vidoomy\.com|outbrain\.com|taboola\.com|connatix\.com|anyclip\.com/i.test(url);
  };

  /**
   * Gắn lịch quét cho một tab để nhận form tải chậm và giới hạn AI fallback sau lượt autofill đầu.
   *
   * @param {object} page Tab Chrome cần theo dõi.
   * @return {void} Đăng ký bộ hẹn giờ và dọn khi tab đóng.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-10-21
   */
  function watchPage(page) {
    return attachAutofillPageWatcher(page, {
      trackedPages,
      options,
      session,
      fillVisibleForms,
      record,
      checkLeadAfterEmailOnPage,
      isSpamAdUrl,
      watchPage
    });
  }
  context.on('page', watchPage);
  for (const page of context.pages()) watchPage(page);
}
export { attachAutofill };
