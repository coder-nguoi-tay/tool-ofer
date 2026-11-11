import { isLeadWaitEnabled } from './is-lead-wait-enabled.mjs';
import { protectConfirmedLeadSession } from '../leads/actions/protect-confirmed-lead-session.mjs';
/**
 * Cập nhật màn hình, email và bước chuyển trang để phối hợp kiểm tra lead.
 * @param {object} context Frame, dữ liệu lead và tiến độ của lượt quét.
 * @return {Promise<boolean>} True khi cần dừng quét trang.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function trackFrameScreen({
  screenInfo,
  frameProgress,
  session,
  options,
  page,
  frame
}) {
  if (screenInfo?.hasEmailInput) {
    frameProgress.frameHasEmail = true;
    session.screenHasEmail = true;
  }
  if (screenInfo?.isScreen5) {
    session.currentScreen = 5;
    session.isAtScreen5 = true;
  }

  // Theo dõi chữ ký màn hình thực tế (True Screen Transition):
  // Chỉ tăng completedScreens khi màn hình/bước form THỰC SỰ thay đổi sau khi
  // đã submit form (hasSubmittedCurrentScreen) HOẶC sau khi click đáp án
  // (answerClickPending) và màn thực sự đổi. Click mà trang không đi đâu
  // (không nhập form, cùng màn) KHÔNG được tính là màn nhảy.
  if (screenInfo?.screenSignature) {
    if (!session.lastActiveScreenSignature) {
      session.lastActiveScreenSignature = screenInfo.screenSignature;
      session._candidateScreenSignature = null;
    } else if (session.lastActiveScreenSignature !== screenInfo.screenSignature) {
      // Chống đếm ảo: chữ ký mới phải ỔN ĐỊNH 2 lượt quét liên tiếp (chữ ký
      // trang khảo sát rebuild DOM sinh id ngẫu nhiên giữa chừng) trước khi
      // chấp nhận là một màn thực sự khác. Sai khác thoáng qua sẽ bị hủy.
      const canCount = Boolean(session.hasSubmittedCurrentScreen || session.answerClickPending);
      const stableNew = session._candidateScreenSignature === screenInfo.screenSignature;
      if (canCount && stableNew) {
        session.completedScreens = (session.completedScreens || 0) + 1;
        session.currentScreen = session.completedScreens + 1;
        session.pageJumps = Math.max(session.pageJumps || 0, session.completedScreens);
        session.screenReached = Math.max(session.screenReached || 1, session.currentScreen);
        session.lastActiveScreenSignature = screenInfo.screenSignature;
        session._candidateScreenSignature = null;
        session.hasSubmittedCurrentScreen = false;
        session.answerClickPending = false;
        console.log(`[ScreenProgress] Xác nhận chuyển màn thực tế thành công: Màn ${session.completedScreens - 1} -> Màn ${session.currentScreen}`);
        options.onLog?.({
          type: 'screen_advanced',
          detail: `Đã hoàn thành Màn ${session.completedScreens}, chuyển sang Màn ${session.currentScreen}.`
        }, page);
        options.onScreenAdvanced?.(session, session.currentScreen, session.pageJumps);

        // Gỡ bỏ bộ đếm submit trên các nút của màn mới
        await frame.evaluate(() => {
          document.querySelectorAll('[data-ux-submit-count], [data-ux-submitted]').forEach(b => {
            b.removeAttribute('data-ux-submit-count');
            b.removeAttribute('data-ux-submitted');
            delete b.dataset.uxSubmitCount;
            delete b.dataset.uxSubmitted;
          });
        }).catch(() => {});
      } else {
        // Ghi nhận ứng viên chắn màn mới, chờ lượt sau xác nhận ổn định
        if (canCount && !stableNew) {
          options.onLog?.({
            type: 'screen_change_pending',
            detail: `Phát hiện màn mới nhưng chưa ổn định; chờ lượt quét tiếp theo xác nhận (chống đếm ảo).`
          }, page);
        }
        session._candidateScreenSignature = screenInfo.screenSignature;
      }
    } else {
      session._candidateScreenSignature = null;
    }
  }

  // Nếu đang ở Jump Page (sau Màn 4) và chưa kiểm tra lead:
  // TẠM DỪNG, KHÔNG CLICK NÚT NHẬN THƯỞNG, GỌI KIỂM TRA LEAD TRÙNG IP!
  const isRealJumpPage = Boolean(screenInfo?.isJumpPage);
  if (isRealJumpPage && isLeadWaitEnabled(session, options) && !protectConfirmedLeadSession(session) && !session.screen5LeadVerified) {
    if (!session.emailFilled) {
      console.log(`[LeadCheck] Đang ở Jump Page nhưng ô Gmail/Email chưa được điền hợp lệ. Bỏ qua kiểm tra lead, tiếp tục làm form.`);
    } else if (!session.screen5LeadCheckTriggered) {
      session.screen5LeadCheckTriggered = true;
      session.leadCheckTriggered = true;
      session.leadCheckStatus = 'checking';
      session.leadCheckReason = 'jump_page';
      console.log(`[LeadCheck] Đang ở Jump Page nhận thưởng (sau Màn ${session.completedScreens || 0}). Bắt đầu tạm dừng và chờ kiểm tra lead...`);
      options.onLog?.({
        type: 'jump_page_lead_check',
        detail: `Đã tới Jump Page nhận thưởng sau khi điền ${session.completedScreens || 0} màn. Bắt đầu chờ đợi lead (1 lần x 20s)...`
      });
      if (typeof options.onEmailSubmitted === 'function') {
        options.onEmailSubmitted(session, page);
      } else if (typeof options.onScreen5Reached === 'function') {
        options.onScreen5Reached(session, page);
      }
      return true; // Dừng lại ở Jump Page, đợi kết quả kiểm tra lead!
    }
  }

  // Kiểm tra và chủ động bấm nút submit/tiếp tục nếu có tùy chọn autoSubmit

  return false;
}
