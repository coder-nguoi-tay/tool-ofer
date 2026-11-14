/**
 * Gom link offer giống app chính: Link 1 có thể nhiều dòng (tách theo xuống dòng, dấu phẩy, chấm phẩy), rồi Link 2-4.
 * @return {{offerUrls: string[], websiteUrl: string, websiteUrl2: string, websiteUrl3: string, websiteUrl4: string}} Link đã bỏ trùng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniRunCollectOfferUrls() {
  const read = id => (document.getElementById(id)?.value || '').trim();
  const raw = [read('inputWebsiteUrl'), read('inputWebsiteUrl2'), read('inputWebsiteUrl3'), read('inputWebsiteUrl4')];
  const offerUrls = [];
  for (const line of raw[0].split(/[\r\n,;]+/)) {
    const url = line.trim();
    if (url && !offerUrls.includes(url)) offerUrls.push(url);
  }
  for (const url of raw.slice(1)) if (url && !offerUrls.includes(url)) offerUrls.push(url);
  return { offerUrls, websiteUrl: offerUrls[0] || raw[0], websiteUrl2: offerUrls[1] || raw[1], websiteUrl3: offerUrls[2] || raw[2], websiteUrl4: offerUrls[3] || raw[3] };
}

/**
 * Link của riêng một offer được hẹn giờ: Offer 1 lấy mọi dòng của Link 1, Offer 2-4 lấy đúng ô link tương ứng.
 * @param {number} offerIndex Offer được hẹn (1-4).
 * @return {string[]} Link cần chạy; rỗng khi ô link của offer đó trống.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniRunScheduledOfferUrls(offerIndex) {
  const id = offerIndex === 1 ? 'inputWebsiteUrl' : `inputWebsiteUrl${offerIndex}`;
  const raw = (document.getElementById(id)?.value || '').trim();
  const urls = offerIndex === 1 ? raw.split(/[\r\n,;]+/) : [raw];
  return [...new Set(urls.map(url => url.trim()).filter(Boolean))];
}

/**
 * Lịch hẹn giờ theo từng link (cùng định dạng app chính lưu trong offer: offerIndex, enabled, time).
 * @return {{offerIndex: number, enabled: boolean, time: string}[]} Bốn mục hẹn giờ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniRunGetSchedules() {
  const defaults = ['07:00', '08:00', '12:00', '20:00'];
  return [1, 2, 3, 4].map(offerIndex => ({
    offerIndex,
    enabled: Boolean(document.getElementById(`miniSchedOn${offerIndex}`)?.checked),
    time: document.getElementById(`miniSchedTime${offerIndex}`)?.value || defaults[offerIndex - 1]
  }));
}

/**
 * Đặt lại lịch hẹn giờ từ offer đã lưu.
 * @param {object[]} schedules Mảng lịch của offer.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniRunApplySchedules(schedules) {
  for (const item of Array.isArray(schedules) ? schedules : []) {
    const toggle = document.getElementById(`miniSchedOn${item.offerIndex}`);
    const time = document.getElementById(`miniSchedTime${item.offerIndex}`);
    if (toggle) toggle.checked = Boolean(item.enabled);
    if (time && item.time) time.value = item.time;
  }
}

/**
 * Payload lưu offer đủ trường như app chính (chờ tối đa, ẩn hiện, trùng IP, hẹn giờ, cách giải mặc định auto_full).
 * @return {object} Body cho POST /pc/offer/save.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniRunBuildOfferPayload() {
  const value = id => document.getElementById(id)?.value ?? '';
  const links = [value('inputWebsiteUrl').trim(), value('inputWebsiteUrl2').trim(), value('inputWebsiteUrl3').trim(), value('inputWebsiteUrl4').trim()];
  const name = value('inputOfferName').trim();
  return {
    NameOffer: name || links[0].split('\n')[0].slice(0, 35) || 'Offer Mới',
    LinkOffer: links[0], LinkOffer2: links[1], LinkOffer3: links[2], LinkOffer4: links[3],
    MaxRunMinutes: value('inputTimeLimit') || '10',
    Complete: value('inputCompleteText'),
    delayStart: value('inputDelayStart') || '1',
    delayStop: value('inputDelayStop') || '1',
    Thread: (typeof inputThreadCount !== 'undefined' && inputThreadCount.value) || '1',
    LimitRun: value('inputLimitRun') || '0',
    CheckDuplicate: document.getElementById('cbxCheckDuplicateIP')?.checked ?? true,
    HideUntilTarget: document.getElementById('cbxHideUntilTarget')?.checked ?? false,
    HideUntilLead: document.getElementById('cbxHideUntilLead')?.checked ?? false,
    schedules: miniRunGetSchedules(),
    methodConfigs: links.map((link, index) => ({ offerNumber: index + 1, link: link || null, mode: 'auto_full', autoSubmit: true, maxPick: null, pickRandom: false, notes: '' }))
  };
}

/**
 * Lưu offer lên máy Mac (dùng chung cho nút Lưu và tự lưu khi Start).
 * @param {boolean} [silent=false] Tự lưu khi Start: không báo thành công, chỉ báo lỗi.
 * @return {Promise<boolean>} Lưu thành công hay không.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniRunSaveOffer(silent = false) {
  const payload = miniRunBuildOfferPayload();
  if (!payload.LinkOffer) {
    if (!silent) alert('Vui lòng nhập Link Offer 1!');
    return false;
  }
  try {
    const res = await fetch('/pc/offer/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Không xác định');
    if (!silent) showToast(`Đã lưu "${payload.NameOffer}" vào máy!`);
    if (typeof loadSavedOffers === 'function') await loadSavedOffers();
    return true;
  } catch (error) {
    showToast('⚠️ Lỗi lưu offer: ' + error.message);
    return false;
  }
}

// Hẹn giờ chạy trên trình duyệt đang mở mini (giống app chính: cần để trang mở tới giờ hẹn).
let miniRunScheduleTimer = null;

/**
 * Bắt đầu đếm ngược tới các mốc hẹn giờ; tới giờ thì gọi chạy. Mốc đã qua hơn 30 giây được dời sang ngày mai.
 * @param {object[]} schedules Lịch đang bật.
 * @param {Function} onExecute Hàm chạy khi tới giờ.
 * @return {boolean} True khi đã đặt hẹn giờ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniRunStartScheduler(schedules, onExecute) {
  miniRunCancelSchedule();
  const now = Date.now();
  const pending = schedules.filter(item => item.enabled && item.time).map(item => {
    const [hour, minute] = item.time.split(':').map(Number);
    const target = new Date();
    target.setHours(hour || 0, minute || 0, 0, 0);
    if (target.getTime() <= now - 30000) target.setDate(target.getDate() + 1);
    return { ...item, targetTime: target.getTime() };
  }).sort((left, right) => left.targetTime - right.targetTime);
  if (!pending.length) return false;
  const banner = document.getElementById('miniScheduleBanner');
  const text = document.getElementById('miniScheduleText');
  if (banner) banner.style.display = 'flex';
  const tick = () => {
    const next = pending[0];
    if (!next) { miniRunCancelSchedule(); return; }
    const left = next.targetTime - Date.now();
    if (left <= 1000) {
      pending.shift();
      if (text) text.textContent = `🚀 Đang chạy Offer ${next.offerIndex} lúc ${next.time}...`;
      void onExecute(next);
      if (!pending.length) setTimeout(miniRunCancelSchedule, 4000);
      return;
    }
    const seconds = Math.floor(left / 1000);
    const pad = n => String(n).padStart(2, '0');
    if (text) text.textContent = `⏰ Hẹn giờ: ${pending.map(item => `Offer ${item.offerIndex} lúc ${item.time}`).join(' · ')} — còn ${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds % 3600 / 60))}:${pad(seconds % 60)}`;
  };
  tick();
  miniRunScheduleTimer = setInterval(tick, 1000);
  return true;
}

/**
 * Huỷ hẹn giờ đang chờ.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniRunCancelSchedule() {
  if (miniRunScheduleTimer) clearInterval(miniRunScheduleTimer);
  miniRunScheduleTimer = null;
  const banner = document.getElementById('miniScheduleBanner');
  if (banner) banner.style.display = 'none';
}

/**
 * Bật/tắt "Không bù slot" ngay khi đang chạy (giữ phiên đang mở, không mở phiên bù).
 * @param {boolean} checked Trạng thái người dùng chọn.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniRunToggleNoSlotRefill(checked) {
  const checkbox = document.getElementById('cbxNoSlotRefill');
  if (!checkbox) return;
  checkbox.disabled = true;
  try {
    const res = await fetch('/auto-refill/no-slot-refill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ noSlotRefill: checked }) });
    const data = await res.json();
    if (data?.error) throw new Error(data.error);
    checkbox.checked = data.noSlotRefill === true;
    showToast(checkbox.checked ? 'Đã bật Không bù slot' : 'Đã cho phép bù slot trở lại');
  } catch (error) {
    checkbox.checked = !checked;
    showToast('⚠️ Không cập nhật được chế độ bù slot: ' + (error?.message || error));
  } finally {
    checkbox.disabled = false;
    syncOptionPills();
  }
}

/**
 * AI Assist trên mini bật/tắt AI thật qua cấu hình AI (như app chính), không gửi trường server bỏ qua.
 * @param {boolean} checked Trạng thái người dùng chọn.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniRunToggleAiAssist(checked) {
  const checkbox = document.getElementById('cbxAiAssist');
  try {
    if (typeof miniSetSetAiAssistEnabled !== 'function') throw new Error('chưa nạp tab Cài đặt');
    await miniSetSetAiAssistEnabled(checked);
    showToast(checked ? '🤖 Đã bật AI Assist' : 'Đã tắt AI Assist');
  } catch (error) {
    if (checkbox) checkbox.checked = !checked;
    showToast('⚠️ Không lưu được AI Assist: ' + (error?.message || error));
  } finally {
    syncOptionPills();
  }
}
