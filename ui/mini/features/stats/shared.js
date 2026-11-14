// ─── TAB 4 THỐNG KÊ: trạng thái và tiện ích dùng chung (phải nằm đầu nhóm features/stats trong bundle) ───
const miniStatsState = {
  logs: [],
  logSeq: 0,
  logEpoch: '',
  logOffer: 'all',
  runOffer: 'all',
  leads: [],
  leadStats: {},
  bandwidth: null,
  bandwidthTimer: null,
};

// Nhãn loại log (giống bộ lọc Type của bản desktop).
const miniStatsLogTypes = {
  navigate: '🔗 Điều hướng',
  submit_clicked: '🚀 Submit',
  checkbox_checked: '☑️ Checkbox',
  field_filled: '✍️ Điền form',
  click: '🖱 Click chuột',
  ai_started: '🤖 AI phân tích',
  ai_waiting_codex: '🤖 AI chờ CLI',
  ai_codex_reply: '🤖 AI phản hồi',
  ai_action: '🤖 AI thực thi',
  ai_completed: '🤖 AI hoàn tất',
  ai_smart_fallback: '🛡️ AI Fallback',
  ai_sync_scan: '🔄 AI Sync',
  ai_error: '⚠️ AI lỗi',
  lead_confirmed: '✅ Có lead',
  lead_ip_mismatch: '⚠️ Lead chưa khớp IP',
  lead_check_error: '⚠️ Lỗi kiểm tra lead',
  lead_failed: '❌ Không có lead',
  traffic_blocked: '🚫 Bị chặn',
  adtrapper_reload: '🔄 Tải lại',
  gologin_device_detected: '📱 Fingerprint',
};

/**
 * Gửi POST JSON tới server, luôn trả object (lỗi mạng thành `{error}`).
 * @param {string} url Đường dẫn API.
 * @param {object} body Nội dung JSON gửi đi.
 * @return {Promise<object>} JSON phản hồi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniStatsPost(url, body = {}) {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return (await res.json().catch(() => ({}))) || {};
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Hỏi xác nhận trước thao tác xoá/đặt lại: dùng hộp thoại Telegram nếu có, ngoài ra dùng confirm của trình duyệt.
 * @param {string} message Nội dung câu hỏi.
 * @return {Promise<boolean>} True khi người dùng đồng ý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniStatsConfirm(message) {
  if (tg?.showConfirm && tg.isVersionAtLeast?.('6.2')) return new Promise((resolve) => tg.showConfirm(message, (ok) => resolve(Boolean(ok))));
  return Promise.resolve(Boolean(window.confirm(message)));
}

/**
 * Sao chép văn bản vào bộ nhớ tạm và báo toast.
 * @param {string} text Văn bản cần sao chép.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniStatsCopy(text) {
  if (!text) return;
  navigator.clipboard?.writeText(text).then(() => showToast(`Đã sao chép: ${text}`)).catch(() => showToast('Không sao chép được'));
}

/**
 * Định dạng số byte thành B/KB/MB/GB/TB.
 * @param {number} bytes Số byte.
 * @return {string} Chuỗi đã định dạng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniStatsFormatBytes(bytes) {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 B';
  const i = Math.min(4, Math.floor(Math.log(bytes) / Math.log(1024)));
  if (i <= 0) return `${Math.round(bytes)} B`;
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${['B', 'KB', 'MB', 'GB', 'TB'][i]}`;
}

/**
 * Link offer đang cấu hình ở tab Vận hành (offer 1-4), dùng để luôn hiện tab offer kể cả khi chưa có log.
 * @return {Object<string, string>} Số offer → link đầu tiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniStatsConfiguredOffers() {
  const map = {};
  ['', '2', '3', '4'].forEach((suffix, i) => {
    const val = (document.getElementById(`inputWebsiteUrl${suffix}`)?.value || '').trim();
    if (val) map[String(i + 1)] = val.split(/\r?\n/)[0].trim();
  });
  return map;
}

/**
 * Dựng hàng pill chọn offer (Tất cả + từng offer kèm số đếm).
 * @param {Set<string>} keys Các số offer.
 * @param {Object<string, number>} counts Số đếm theo offer.
 * @param {number} total Tổng số đếm.
 * @param {string} active Offer đang chọn ('all' hoặc số).
 * @param {string} onClickFn Tên hàm global nhận số offer.
 * @return {string} HTML các pill.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniStatsOfferPillsHtml(keys, counts, total, active, onClickFn) {
  const sorted = [...keys].sort((a, b) => Number(a) - Number(b));
  return [`<div class="pill-btn ${active === 'all' ? 'active' : ''}" onclick="${onClickFn}('all')">🌐 Tất cả (${total})</div>`]
    .concat(sorted.map((k) => `<div class="pill-btn ${active === k ? 'active' : ''}" onclick="${onClickFn}('${escHtml(k)}')">🏷️ Offer ${escHtml(k)} (${counts[k] || 0})</div>`))
    .join('');
}
