/**
 * Quản lý hẹn giờ tự động chạy offer theo mốc giờ người dùng chọn (ví dụ 07:00, 08:00).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */

window._activeOfferScheduleTimer = null;
window._activeOfferSchedules = [];

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

    const summary = remainingSchedules
      .map(s => `Offer ${s.offerIndex} lúc <b style="color:#fff;">${s.time}</b> (còn <span style="color:#fbbf24;">${formatCountdown(s.targetTime - now)}</span>)`)
      .join(' · ');

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
  if (banner) banner.style.display = 'none';

  const btnStart = document.getElementById('btnStart');
  if (btnStart) {
    btnStart.disabled = false;
    btnStart.classList.remove('win-btn-warning');
    btnStart.textContent = '▶ Start';
  }
}
