/**
 * Quản lý hẹn giờ tự động chạy offer theo mốc giờ người dùng chọn (ví dụ 07:00, 08:00).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */

window._activeOfferScheduleTimer = null;
window._activeOfferSchedules = [];
window._activeStopScheduleTimer = null;
window._activeStopSchedule = null;

/**
 * Tính timestamp của mốc giờ tiếp theo (hôm nay hoặc ngày mai nếu giờ đã qua).
 * @param {string} timeStr Chuỗi giờ định dạng HH:mm (ví dụ "07:00").
 * @return {number} Unix timestamp milliseconds.
 */
function getNextScheduledTimestamp(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.split(':');
  const targetHour = parseInt(parts[0], 10) || 0;
  const targetMinute = parseInt(parts[1], 10) || 0;

  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), targetHour, targetMinute, 0, 0);

  // Nếu mốc hẹn đã qua hơn 30 giây trong ngày hôm nay, hẹn sang ngày mai
  if (target.getTime() <= now.getTime() - 30000) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

/**
 * Định dạng số milliseconds còn lại thành chuỗi đếm ngược dễ đọc.
 * @param {number} ms Milliseconds còn lại.
 * @return {string} Chuỗi hiển thị giờ phút giây.
 */
function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = n => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${hours} giờ ${pad(minutes)} phút ${pad(seconds)}s`;
  }
  return `${pad(minutes)} phút ${pad(seconds)}s`;
}

/**
 * Bắt đầu đếm ngược hẹn giờ chạy các offer.
 * @param {Array<{offerIndex: number, enabled: boolean, time: string}>} scheduledOffers Danh sách offer có hẹn giờ.
 * @param {Function} onExecute Callback khi đến giờ hẹn để thực thi mở offer.
 * @return {boolean} True nếu đã kích hoạt lịch hẹn thành công.
 */
function startOfferScheduler(scheduledOffers, onExecute) {
  cancelOfferSchedule();
  if (!Array.isArray(scheduledOffers) || scheduledOffers.length === 0) return false;

  const validSchedules = scheduledOffers
    .filter(s => s && s.enabled && s.time)
    .map(s => ({
      ...s,
      targetTime: getNextScheduledTimestamp(s.time),
      executed: false
    }))
    .sort((a, b) => a.targetTime - b.targetTime);

  if (validSchedules.length === 0) return false;

  window._activeOfferSchedules = validSchedules;

  const banner = document.getElementById('offerScheduleBanner');
  const bannerText = document.getElementById('offerScheduleBannerText');
  const btnStart = document.getElementById('btnStart');

  if (banner) banner.style.display = 'flex';
  if (btnStart) {
    btnStart.textContent = `⏰ Chờ hẹn giờ (${validSchedules[0].time})...`;
    btnStart.classList.add('win-btn-warning');
  }

  const updateTick = () => {
    const now = Date.now();
    const remainingSchedules = window._activeOfferSchedules.filter(s => !s.executed);

    if (remainingSchedules.length === 0) {
      cancelOfferSchedule();
      return;
    }

    const next = remainingSchedules[0];
    const diff = next.targetTime - now;

    if (diff <= 1000) {
      next.executed = true;
      console.log(`[Scheduler] Đã đến giờ ${next.time}! Tự động khởi chạy Offer ${next.offerIndex}.`);
      if (bannerText) bannerText.textContent = `🚀 Đang kích hoạt Offer ${next.offerIndex} lúc ${next.time}...`;

      if (typeof onExecute === 'function') {
        onExecute(next);
      }

      const nextRemaining = window._activeOfferSchedules.filter(s => !s.executed);
      if (nextRemaining.length === 0) {
        setTimeout(cancelOfferSchedule, 4000);
      } else {
        if (btnStart) btnStart.textContent = `⏰ Chờ hẹn giờ (${nextRemaining[0].time})...`;
      }
      return;
    }

    let summary = remainingSchedules
      .map(s => `Offer ${s.offerIndex} lúc <b style="color:#fff;">${s.time}</b> (còn <span style="color:#fbbf24;">${formatCountdown(s.targetTime - now)}</span>)`)
      .join(' · ');

    if (window._activeStopSchedule && window._activeStopSchedule.enabled) {
      summary += ` · 🛑 Tắt lúc <b style="color:#f87171;">${window._activeStopSchedule.time}</b>`;
    }

    if (bannerText) {
      bannerText.innerHTML = `⏰ Đang hẹn giờ: ${summary}`;
    }
  };

  updateTick();
  window._activeOfferScheduleTimer = setInterval(updateTick, 1000);
  return true;
}

/**
 * Hủy bỏ hẹn giờ chạy offer và ẩn thanh thông báo.
 * @return {void}
 */
function cancelOfferSchedule() {
  if (window._activeOfferScheduleTimer) {
    clearInterval(window._activeOfferScheduleTimer);
    window._activeOfferScheduleTimer = null;
  }
  window._activeOfferSchedules = [];

  const banner = document.getElementById('offerScheduleBanner');
  if (banner && (!window._activeStopSchedule || !window._activeStopSchedule.enabled)) {
    banner.style.display = 'none';
  }

  const btnStart = document.getElementById('btnStart');
  if (btnStart) {
    btnStart.disabled = false;
    btnStart.classList.remove('win-btn-warning');
    btnStart.textContent = '▶ Start';
  }
}

/**
 * Bắt đầu đếm ngược hẹn giờ tắt ("Chạy đến mấy giờ thì tắt").
 * @param {{enabled: boolean, time: string}} stopSetting Cấu hình hẹn giờ tắt.
 * @param {Function} [onStop] Callback khi đến giờ tắt (mặc định gọi handleStop).
 * @return {boolean} True nếu kích hoạt lịch hẹn tắt thành công.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
function startStopScheduler(stopSetting, onStop) {
  cancelStopScheduler();
  if (!stopSetting || !stopSetting.enabled || !stopSetting.time) return false;

  const targetTime = getNextScheduledTimestamp(stopSetting.time);
  if (!targetTime) return false;

  window._activeStopSchedule = {
    ...stopSetting,
    targetTime
  };

  const banner = document.getElementById('offerScheduleBanner');
  const bannerText = document.getElementById('offerScheduleBannerText');

  const updateStopTick = () => {
    const now = Date.now();
    if (!window._activeStopSchedule) return;

    const diff = window._activeStopSchedule.targetTime - now;
    if (diff <= 1000) {
      const stopTime = window._activeStopSchedule.time;
      cancelStopScheduler();
      console.log(`[Scheduler] Đã đến giờ hẹn tắt (${stopTime})! Đang đóng các phiên chưa có lead và giữ phiên có lead.`);
      if (bannerText) {
        bannerText.innerHTML = `🛑 <b style="color:#fbbf24;">Đã đến giờ hẹn tắt (${stopTime})! Đang kiểm tra lead và đóng phiên...</b>`;
      }
      if (typeof onStop === 'function') {
        onStop();
      } else {
        executeScheduledAutoStop(stopTime);
      }
      return;
    }

    // Nếu không có lịch hẹn bắt đầu nào đang chờ thì hiển thị thông tin hẹn tắt lên banner
    const hasPendingStart = Array.isArray(window._activeOfferSchedules) && window._activeOfferSchedules.some(s => !s.executed);
    if (!hasPendingStart && banner && bannerText) {
      banner.style.display = 'flex';
      bannerText.innerHTML = `⏰ Đang chạy auto · Tự tắt lúc <b style="color:#fff;">${window._activeStopSchedule.time}</b> (còn <span style="color:#f87171;">${formatCountdown(diff)}</span>)`;
    }
  };

  updateStopTick();
  window._activeStopScheduleTimer = setInterval(updateStopTick, 1000);
  return true;
}

/**
 * Thực thi lệnh dừng auto theo giờ hẹn: bảo lưu các phiên có lead, đóng phiên chưa lead và tắt tự bù.
 * @param {string} stopTime Mốc giờ tắt.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
async function executeScheduledAutoStop(stopTime) {
  const banner = document.getElementById('offerScheduleBanner');
  const bannerText = document.getElementById('offerScheduleBannerText');
  const lbStatus = document.getElementById('lbStatus');
  if (lbStatus) {
    lbStatus.textContent = `Đã đến giờ hẹn tắt (${stopTime}). Đang đóng các phiên chưa có lead...`;
  }
  let result = null;
  if (typeof api === 'function') {
    result = await api('/auto-stop/execute', { method: 'POST' });
  } else if (typeof handleStop === 'function') {
    await handleStop();
  }
  const leadKept = result?.leadSessionsKeptCount || 0;
  const closedCount = result?.closedCount ?? result?.results?.length ?? 0;
  if (leadKept > 0) {
    const msg = `🛑 Đã đến giờ hẹn tắt (${stopTime}): Đã đóng ${closedCount} phiên chưa có lead; đang giữ ${leadKept} phiên có lead làm nốt (không bù slot).`;
    if (bannerText) {
      bannerText.innerHTML = `🛑 <b style="color:#fbbf24;">Đã đến giờ hẹn tắt (${stopTime}):</b> Đã đóng ${closedCount} phiên chưa lead; <b style="color:#a7f3d0;">giữ ${leadKept} phiên có lead làm nốt</b> (không bù slot).`;
    }
    if (lbStatus) lbStatus.textContent = msg;
    if (banner) banner.style.display = 'flex';
  } else {
    const msg = `Đã dừng toàn bộ luồng & đóng trình duyệt theo giờ hẹn (${stopTime}).`;
    if (bannerText) {
      bannerText.innerHTML = `🛑 <b style="color:#f87171;">Đã đến giờ hẹn tắt (${stopTime}): Đã dừng toàn bộ luồng & đóng trình duyệt.</b>`;
    }
    if (lbStatus) lbStatus.textContent = msg;
    setTimeout(() => {
      const hasPendingStart = Array.isArray(window._activeOfferSchedules) && window._activeOfferSchedules.some(s => !s.executed);
      if (!hasPendingStart && banner) {
        banner.style.display = 'none';
      }
    }, 6000);
  }
  if (typeof fetchRunningState === 'function') {
    fetchRunningState();
  }
}

/**
 * Hủy bỏ hẹn giờ tắt auto.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
function cancelStopScheduler() {
  if (window._activeStopScheduleTimer) {
    clearInterval(window._activeStopScheduleTimer);
    window._activeStopScheduleTimer = null;
  }
  window._activeStopSchedule = null;

  const hasPendingStart = Array.isArray(window._activeOfferSchedules) && window._activeOfferSchedules.some(s => !s.executed);
  if (!hasPendingStart) {
    const banner = document.getElementById('offerScheduleBanner');
    if (banner) banner.style.display = 'none';
  }
}

/**
 * Đồng bộ trạng thái hẹn giờ tắt giữa giao diện và timer.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
function syncStopSchedulerState() {
  const stopSetting = typeof getScheduleStopSettings === 'function'
    ? getScheduleStopSettings()
    : { enabled: false, time: '23:00' };

  if (stopSetting && stopSetting.enabled && stopSetting.time) {
    startStopScheduler(stopSetting, async () => {
      await executeScheduledAutoStop(stopSetting.time);
    });
    if (typeof api === 'function') {
      api('/auto-stop/schedule', {
        method: 'POST',
        body: JSON.stringify(stopSetting)
      }).catch(() => {});
    }
  } else {
    cancelStopScheduler();
    if (typeof api === 'function') {
      api('/auto-stop/schedule', {
        method: 'POST',
        body: JSON.stringify({ enabled: false })
      }).catch(() => {});
    }
  }
}
