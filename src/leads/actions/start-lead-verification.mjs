import { protectConfirmedLeadSession } from './protect-confirmed-lead-session.mjs';
import { DEFAULT_LEAD_CONFIG } from '../../../lead-check.mjs';
import { activeBrowsers } from '../../browser/sessions.mjs';
import { browserSessionLogs } from '../../logging/browser-logs.mjs';
import { fetchLeadDatas } from '../../../lead-check.mjs';
import { isLeadPresent } from '../../../lead-check.mjs';
import { normalizeIpAddress } from '../../../lead-check.mjs';
import { queueSaveBrowserLogs } from '../../logging/browser-logs.mjs';
import { saveAndRecordLeadIpStats } from "../statistics/save-and-record-lead-ip-stats.mjs";
import { tgNotify } from '../../../tgbot.mjs';

/**
 * Bắt đầu quy trình kiểm tra lead khi đến/hoàn thành màn đích (mặc định màn 5: DOB/Gender).
 * Gọi API toffers.top kiểm tra IP sock theo chu kỳ cấu hình (mặc định mỗi 30s, tối đa 2 lần).
 * Nếu IP xuất hiện: cho phép autofill tiếp tục các bước sau (Jump Page, Reward, Offerwall).
 * Chỉ đóng Chrome khi API trả dữ liệu hợp lệ nhưng không có lead; giữ Chrome khi dữ liệu có lead chưa khớp IP hoặc API lỗi.
 *
 * @param {object} session Phiên Chrome đang chạy.
 * @param {object} leadConfig Cấu hình API và thời gian chờ.
 * @return {Promise<void>} Hoàn tất quy trình kiểm tra lead.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function startLeadVerification(session, leadConfig) {
  // Chỉ check lead khi người dùng tick ô "Check Lead" (leadConfig.enabled === true).
  if (protectConfirmedLeadSession(session) || session.leadCheckRunning || leadConfig.enabled !== true) return;
  // BẢO VỆ CHẶN CHECK LEAD ẢO: Tuyệt đối không chuyển sang checking khi chưa điền Gmail
  if (!session.emailFilled) {
    const slotNum = session.tileIndex !== undefined ? session.tileIndex + 1 : session.slot || 1;
    console.log(`[LeadCheck] Slot ${slotNum}: Ô Gmail/Email chưa được điền hợp lệ (session.emailFilled = false). Bỏ qua kích hoạt chờ kiểm tra lead, tiếp tục làm form.`);
    return;
  }
  session.leadCheckRunning = true;
  session.leadCheckStatus = 'checking';
  const exitIp = session.exitIp;
  const proxyHost = session.proxyServer ? normalizeIpAddress(session.proxyServer) : null;
  const targetIps = [exitIp || proxyHost].filter(Boolean);
  const targetDesc = session.completedScreens ? `Màn ${session.completedScreens}` : session.emailScreenNumber ? `màn điền email (Màn ${session.emailScreenNumber})` : leadConfig.checkScreen ? `Màn ${leadConfig.checkScreen}` : 'sau khi điền form';
  const slotNum = session.tileIndex !== undefined ? session.tileIndex + 1 : session.slot || 1;
  const label = `Slot ${slotNum} [IP: ${exitIp}]`;
  console.log(`[LeadCheck] ${label}: Đã nộp ${targetDesc}. Bắt đầu kiểm tra lead từ toffers.top...`);
  try {
    const updateBadge = text => {
      session.updateBadge?.(text);
    };
    const intervalSeconds = Math.max(1, Number(leadConfig.intervalSeconds) || DEFAULT_LEAD_CONFIG.intervalSeconds || 30);
    const maxAttempts = Math.max(1, Number(leadConfig.maxAttempts) || DEFAULT_LEAD_CONFIG.maxAttempts || 2);
    const attemptText = maxAttempts > 1 ? `${maxAttempts} lần x ${intervalSeconds}s` : `1 lần ${intervalSeconds}s`;
    session.leadCheckMessage = `Đã nộp ${targetDesc}; bắt đầu chờ kiểm tra lead (${attemptText})...`;
    updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#f59e0b;">⏳ Chờ lead (${attemptText})...</span>`);

    // Đóng Chrome để phiên tự bù mở slot mới với proxy khác (closingDueToNoLead: không tính là người dùng tự đóng).
    /**
     * Đóng phiên chưa có lead để bù slot; huỷ thao tác nếu IP vừa được xác nhận có lead.
     * @param {string} logType Loại log của nguyên nhân đóng.
     * @param {string} reasonText Nguyên nhân đóng phiên.
     * @return {Promise<void>} Hoàn tất đóng phiên hoặc giữ mở khi có lead.
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-11-10
     */
    const closeForNewSlot = async (logType, reasonText) => {
      if (protectConfirmedLeadSession(session)) return;
      session.closingDueToNoLead = true;
      session.leadCheckMessage = `❌ ${reasonText}. Tự động tắt trình duyệt để đổi sock mới...`;
      updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#ef4444;">❌ ${reasonText}. Tự tắt Chrome...</span>`);
      console.log(`[LeadCheck] ${label}: ❌ ${reasonText}. Tắt trình duyệt và xoay sock.`);
      // Qua addBrowserLog: có id/sequence, được gộp và theo chính sách chụp bằng chứng của recorder.
      session.addBrowserLog?.({
        offer: session.offerNumber ?? session.streamRole ?? 1,
        type: logType,
        ip: exitIp,
        detail: `${reasonText}. Tự động đóng trình duyệt để chuyển proxy tiếp theo.`
      });
      try {
        if (session.browser && !session.browser.isClosed?.()) {
          session.suppressAutoRefill = false;
          await session.browser.close().catch(() => {});
        }
      } catch (closeErr) {
        console.warn(`[LeadCheck] ${label}: Lỗi khi đóng trình duyệt:`, closeErr.message);
      }
    };
    let leadFound = false;
    let attempt = 0;
    let latestAttemptHadApiError = false;
    let lastApiErrorMessage = '';
    let latestLeadData = null;

    // 2 lần x 30s: Mỗi lượt chờ 30s, gọi API kiểm tra lead (lead về giữa chừng ở các nhịp 10s là tiếp tục ngay)
    const pollIntervalSec = 10;
    for (attempt = 1; attempt <= maxAttempts && !leadFound; attempt++) {
      console.log(`[LeadCheck] ${label}: Bắt đầu lượt kiểm tra lead ${attempt}/${maxAttempts} (${intervalSeconds}s)...`);
      let attemptSecondsLeft = intervalSeconds;
      while (attemptSecondsLeft > 0) {
        if (protectConfirmedLeadSession(session) || !activeBrowsers.has(session) || session.browser?.isClosed?.()) {
          return; // Phiên đã bị đóng bởi người dùng
        }
        session.leadCheckMessage = `Đang chờ có lead (lượt ${attempt}/${maxAttempts}), còn ${attemptSecondsLeft}s...`;
        updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#f59e0b;">⏳ Chờ lead ${attempt}/${maxAttempts} (còn ${attemptSecondsLeft}s)...</span>`);
        const sleepTime = Math.min(attemptSecondsLeft, pollIntervalSec);
        for (let s = sleepTime; s > 0; s--) {
          if (protectConfirmedLeadSession(session) || !activeBrowsers.has(session) || session.browser?.isClosed?.()) return;
          const curRemaining = attemptSecondsLeft - (sleepTime - s);
          session.leadCheckMessage = `Đang chờ có lead (lượt ${attempt}/${maxAttempts}), còn ${curRemaining}s...`;
          updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#f59e0b;">⏳ Chờ lead ${attempt}/${maxAttempts} (còn ${curRemaining}s)...</span>`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        attemptSecondsLeft -= sleepTime;

        // Kiểm tra API ở nhịp 10s hoặc cuối lượt 30s
        try {
          console.log(`[LeadCheck] ${label}: Gọi API kiểm tra lead (lượt ${attempt}/${maxAttempts}, còn ${attemptSecondsLeft}s)...`);
          const leadData = await fetchLeadDatas(leadConfig);
          if (protectConfirmedLeadSession(session)) return;
          latestLeadData = leadData;
          latestAttemptHadApiError = false;
          const isPresent = isLeadPresent(leadData, targetIps);
          if (isPresent) {
            leadFound = true;
            console.log(`[LeadCheck] ${label}: ✅ Tìm thấy lead cho IP ${exitIp} ở lượt ${attempt}/${maxAttempts}! Tiếp tục làm tiếp.`);
            break;
          } else {
            console.log(`[LeadCheck] ${label}: ⚠️ Chưa thấy IP ${exitIp} trong dữ liệu lead (lượt ${attempt}/${maxAttempts}, còn ${attemptSecondsLeft}s).`);
          }
        } catch (err) {
          latestAttemptHadApiError = true;
          lastApiErrorMessage = err.message.split('\n')[0];
          console.error(`[LeadCheck] ${label}: ⚠️ Lỗi khi gọi API kiểm tra lead: ${lastApiErrorMessage}`);
          session.leadCheckMessage = `⚠️ Lỗi API toffers.top: ${lastApiErrorMessage}`;
          updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#dc2626;">⚠️ Lỗi API (${err.code || 'ERR'})</span>`);
        }
      }
    }
    if (protectConfirmedLeadSession(session)) return;
    if (leadFound) {
      session.confirmedLeadIp = normalizeIpAddress(exitIp);
      session.leadCheckStatus = 'confirmed';
      session.screen5LeadVerified = true;
      const currentScreen = Math.max(session.screenReached || 1, session.currentScreen || 1, (session.completedScreens || 0) + 1);
      const jumpCount = Math.max(session.pageJumps || 0, session.completedScreens || 0, 1);

      // Ghi nhận và lưu lại tiến trình số màn và số lần nhảy trang của IP có lead:
      saveAndRecordLeadIpStats({
        ip: exitIp,
        screen: currentScreen,
        completedScreens: session.completedScreens || 0,
        jumpCount: jumpCount,
        offerNumber: session.offerNumber ?? session.streamRole ?? 1,
        proxy: session.proxyServer || session.proxyKey || '',
        websiteUrl: session.websiteUrl || '',
        confirmedAt: new Date().toISOString(),
        leadAttempt: attempt
      });
      session.leadCheckMessage = `✅ Đã có lead về cho IP ${exitIp}! Đã làm đến Màn ${currentScreen}, đã nhảy trang ${jumpCount} lần. Đang tiếp tục tự điền các bước tiếp theo...`;
      updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#22c55e;">✅ Có lead (Màn ${currentScreen}, nhảy ${jumpCount})</span>`);
      void tgNotify(`🎉 <b>CÓ LEAD!</b>\n🌐 IP: <code>${exitIp}</code>\n📄 Đã làm đến: <b>Màn ${currentScreen}</b>\n🔀 Đã nhảy trang: <b>${jumpCount} lần</b>\n🏷️ Offer: ${session.offerNumber ?? 1}`);

      // Nếu đang bật chế độ ẩn chờ lead: hiển thị trình duyệt lên màn hình ngay khi có lead
      await session.showWindow?.(true);
      const targetScreen = session.completedScreens || leadConfig.checkScreen || 4;
      // Qua addBrowserLog: có id/sequence, được gộp và theo chính sách chụp bằng chứng của recorder.
      session.addBrowserLog?.({
        offer: session.offerNumber ?? session.streamRole ?? 1,
        type: 'lead_confirmed',
        ip: exitIp,
        detail: `Đã xác nhận có lead trên toffers.top ở lần kiểm tra thứ ${attempt} (Màn ${targetScreen}). Đã làm đến Màn ${currentScreen}, đã nhảy trang ${jumpCount} lần.`
      });

      // Kích hoạt ngay lượt quét autofill tiếp theo để tiếp tục Jump Page / Rewards / Offerwall
      try {
        session.triggerAutofillScan?.();
      } catch {}
    } else if (latestAttemptHadApiError) {
      session.leadCheckStatus = 'api_error';
      session.screen5LeadVerified = false;
      session.leadCheckMessage = `⚠️ Không xác minh được lead do API lỗi: ${lastApiErrorMessage}. Giữ trình duyệt mở.`;
      updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#dc2626;">⚠️ API lỗi; giữ trình duyệt mở</span>`);
      session.addBrowserLog?.({
        type: 'lead_check_error',
        ip: exitIp,
        detail: `Không xác minh được lead sau ${maxAttempts} lần; API lỗi: ${lastApiErrorMessage}. Giữ trình duyệt mở.`
      });
      console.warn(`[LeadCheck] ${label}: ${session.leadCheckMessage}`);
    } else if (latestLeadData?.results?.length > 0) {
      const returnedLeadIps = latestLeadData.results.slice(0, 5).map(lead => `ID ${lead.id || '?'} / IP ${normalizeIpAddress(lead.ip) || '?'}`).join('; ');
      session.leadCheckStatus = 'unmatched';
      session.screen5LeadVerified = false;
      const mismatchText = `Có ${latestLeadData.results.length} lead trong API nhưng chưa khớp IP ${exitIp}`;
      session.addBrowserLog?.({
        type: 'lead_ip_mismatch',
        ip: exitIp,
        detail: `${mismatchText}. API check=${latestLeadData.check || '?'}; mẫu kết quả: ${returnedLeadIps || 'không có IP hợp lệ'}.`
      });
      console.warn(`[LeadCheck] ${label}: ${mismatchText}. API check=${latestLeadData.check || '?'}.`);
      // Lead chưa khớp IP: tắt trình duyệt và bù slot mới (theo yêu cầu, không giữ mở để kiểm tra tay).
      await closeForNewSlot('lead_ip_mismatch_closed', `Lead chưa khớp IP ${exitIp}`);
    } else {
      // Chỉ xoay proxy khi API phản hồi hợp lệ và không trả lead cho dữ liệu đang kiểm tra.
      session.leadCheckStatus = 'failed';
      session.screen5LeadVerified = false;
      const reasonText = `Không có lead về cho IP ${exitIp} sau ${intervalSeconds * maxAttempts}s chờ (${maxAttempts} lần kiểm tra)`;
      if (leadConfig.autoCloseNoLead === false) {
        session.keepOpenAfterLeadCheck = true; // watcher non-offer không được đóng phiên này
        // Checkbox "tự đóng khi hết lead" bị TẮT: giữ trình duyệt mở, không xoay sock tự động.
        session.leadCheckMessage = `⚠️ ${reasonText}. Giữ trình duyệt mở theo cài đặt (không auto-đóng).`;
        updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#f59e0b;">⚠️ Không có lead. Giữ Chrome mở...</span>`);
        console.log(`[LeadCheck] ${label}: ⚠️ ${reasonText}. autoCloseNoLead=false → giữ trình duyệt mở.`);
        // Qua addBrowserLog: có id/sequence, được gộp và theo chính sách chụp bằng chứng của recorder.
        session.addBrowserLog?.({
          offer: session.offerNumber ?? session.streamRole ?? 1,
          type: 'lead_failed_keep_open',
          ip: exitIp,
          detail: `${reasonText}. Đã hết 2 lần × 30s check nhưng để trình duyệt mở theo cài đặt checkbox.`
        });
        return;
      }
      await closeForNewSlot('lead_failed', reasonText);
    }
  } catch (fatalLeadErr) {
    if (protectConfirmedLeadSession(session)) return;
    console.error(`[LeadCheck] ${label}: Lỗi nghiêm trọng khi kiểm tra lead:`, fatalLeadErr.message);
    session.leadCheckStatus = 'api_error';
    session.screen5LeadVerified = false;
    session.leadCheckMessage = `⚠️ Lỗi xử lý check lead: ${fatalLeadErr.message}. Giữ trình duyệt mở.`;
    session.updateBadge?.(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#dc2626;">⚠️ Lỗi check lead; giữ trình duyệt mở</span>`);
    session.addBrowserLog?.({
      type: 'lead_check_error',
      ip: exitIp,
      detail: session.leadCheckMessage
    });
  } finally {
    session.leadCheckRunning = false;
  }
}
