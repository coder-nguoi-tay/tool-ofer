import { attachAutofill } from '../../autofill/attach-autofill.mjs';
import { startLeadVerification } from '../../leads/actions/start-lead-verification.mjs';
import { handleFormRejected } from '../../records/actions/handle-form-rejected.mjs';
import { offerStrategyState } from '../../runtime/constants/offer-strategy-state.mjs';
import { runAiAssist } from '../../ai-assist/run-ai-assist.mjs';
import { resumeAutofillAfterAi } from './resume-autofill-after-ai.mjs';
import { shouldStopAfterLead } from '../../autofill/should-stop-after-lead.mjs';
import { recordConfirmedLeadProgress } from '../../leads/statistics/record-confirmed-lead-progress.mjs';
import { shouldSkipAiOnStuck } from '../../ai-assist/should-skip-ai-on-stuck.mjs';

/**
 * Nối autofill, kiểm tra lead đúng mốc và AI của phiên CDP vào các guard dùng chung.
 * @param {object} session Phiên có mainPage và record riêng trên từng tab.
 * @param {object[]} records Pool dữ liệu người dùng cung cấp.
 * @param {object} leadConfig Cấu hình chủ động chờ lead.
 * @param {boolean} autoSubmit Cho phép gửi form tự động.
 * @return {void} Gắn watcher cho mọi tab của phiên, không check lead ngay khi vừa mở.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
export function attachSessionAutofill(session, records, leadConfig, autoSubmit) {
  /**
   * Chỉ xác minh lead khi autofill đã đi qua email hợp lệ.
   * @param {object} currentSession Phiên phát sinh mốc email.
   * @return {void} Kích hoạt quy trình chờ nếu đã bật.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-17
   */
  function verifyAfterEmail(currentSession) {
    if (currentSession.emailFilled && leadConfig.enabled === true) {
      void startLeadVerification(currentSession, leadConfig);
    }
  }
  attachAutofill(session.browser, records, new URL(session.websiteUrl).origin, session, {
    autoSubmit, choiceDelay: session.choiceDelay, enableLeadCheck: leadConfig.enabled === true,
    offerStrategy: offerStrategyState.get(session.offerNumber) || null,
    onRecordPicked: record => { session.currentRecord = session.mainPage._assignedRecord || record; },
    onLog: (entry, page) => session.addBrowserLog?.(entry, page),
    onFormRejected: handleFormRejected,
    onEmailSubmitted: verifyAfterEmail, onScreen5Reached: verifyAfterEmail,
    // Như Chrome: IP đã có lead thì ghi tiến độ (màn, số lần nhảy trang) cho cột tiến độ ở tab Toffers.
    onScreenAdvanced: (sess, screen, jumps) => recordConfirmedLeadProgress(sess, jumps, screen),
    onPageJump: (sess, jumps) => recordConfirmedLeadProgress(sess, jumps),
    onStuck: page => {
      if (session.isClosed || page.isClosed() || shouldStopAfterLead(session) || shouldSkipAiOnStuck(page)) return;
      const record = { ...(page._assignedRecord || session.currentRecord || {}) };
      if (session.assignedEmail) Object.assign(record, { email: session.assignedEmail, emailaddress: session.assignedEmail, mail: session.assignedEmail, assignedEmail: session.assignedEmail });
      void runAiAssist(page, record, session, { onLog: entry => session.addBrowserLog?.(entry, page) })
        .then(() => resumeAutofillAfterAi(page, session))
        .catch(() => session.addBrowserLog?.({ type: 'ai_error', detail: 'AI thất bại; trả quyền về autofill.' }, page));
    }
  });
}
