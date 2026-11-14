/**
 * Gọi API màn hình của slot, trả JSON hoặc { error } (kể cả khi HTTP lỗi).
 * @param {string} path Đường dẫn API.
 * @param {object} [options] Tùy chọn fetch.
 * @return {Promise<object>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniScreenRequest(path, options = {}) {
  try {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
    const data = (await res.json().catch(() => null)) || {};
    return res.ok ? data : { ...data, error: data.error || `HTTP ${res.status}` };
  } catch (err) {
    return { error: err?.message || 'Không kết nối được máy chủ.' };
  }
}

/**
 * Slot đang xem; báo toast nếu chưa có.
 * @return {number|null}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniScreenSlot() {
  if (!currentSlot) { showToast('Chưa chọn slot nào.'); return null; }
  return currentSlot;
}

/**
 * Sao chép văn bản; WebView không có Clipboard API thì dùng textarea tạm + execCommand.
 * @param {string} text Nội dung cần chép.
 * @param {string} okText Thông báo khi chép xong.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniScreenCopyText(text, okText) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) { showToast('Không sao chép được, hãy chọn và chép thủ công.'); return; }
  }
  showToast(okText);
}

/**
 * Hiện/ẩn dòng nhập URL, điền sẵn URL đang hiển thị.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniScreenToggleUrlRow() {
  const row = document.getElementById('scrUrlRow');
  const input = document.getElementById('scrUrlInput');
  const show = row.style.display === 'none';
  row.style.display = show ? 'flex' : 'none';
  if (!show) return;
  const shown = document.getElementById('urlDisplay')?.textContent.trim() || '';
  input.value = /^https?:\/\//i.test(shown) ? shown : '';
  input.focus();
}

/**
 * Điều hướng tab đang xem tới URL đã nhập (POST /screen/navigate/:slot).
 * @return {Promise<boolean>} true khi máy chủ nhận lệnh.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniScreenNavigate() {
  const slot = miniScreenSlot();
  const url = document.getElementById('scrUrlInput')?.value.trim() || '';
  if (!slot || !url) return false;
  const res = await miniScreenRequest(`/screen/navigate/${slot}`, { method: 'POST', body: JSON.stringify({ url }) });
  if (res.error) { showToast('Không điều hướng được: ' + res.error); return false; }
  const display = document.getElementById('urlDisplay');
  if (display && res.url) display.textContent = res.url;
  document.getElementById('scrUrlRow').style.display = 'none';
  showToast('Đã mở: ' + (res.url || url));
  return true;
}

/**
 * Sao chép URL trong ô nhập (hoặc URL đang hiển thị).
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniScreenCopyUrl() {
  const url = document.getElementById('scrUrlInput')?.value.trim() || document.getElementById('urlDisplay')?.textContent.trim();
  if (url) await miniScreenCopyText(url, 'Đã sao chép URL');
}

/**
 * Mở DevTools của tab đang xem trên máy Mac; engine không hỗ trợ thì mở bảng HTML ngay trên điện thoại.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniScreenOpenDevtools() {
  const slot = miniScreenSlot();
  if (!slot) return;
  const res = await miniScreenRequest(`/screen/devtools/${slot}`, { method: 'POST' });
  if (res.error) { showToast(res.error); return; }
  if (res.mode === 'native') showToast('Đã mở DevTools trên Mac.');
  else miniScreenOpenHtml(0);
}

/**
 * Mở bảng HTML và đọc HTML của frame được chọn (GET /screen/html/:slot?frame=); chỉ hiển thị dạng text.
 * @param {number|string} [frame] Chỉ số frame, mặc định trang chính.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniScreenOpenHtml(frame = 0) {
  const slot = miniScreenSlot();
  if (!slot) return;
  const modal = document.getElementById('scrHtmlModal');
  const output = document.getElementById('scrHtmlContent');
  const requestId = String(Number(modal.dataset.request || 0) + 1);
  Object.assign(modal.dataset, { request: requestId, ready: 'false', slot: String(slot) });
  modal.style.display = 'flex';
  output.value = 'Đang đọc HTML...';
  const res = await miniScreenRequest(`/screen/html/${slot}?frame=${Number(frame) || 0}`);
  if (modal.dataset.request !== requestId) return;
  if (res.error) { output.value = res.error; return; }
  const select = document.getElementById('scrHtmlFrame');
  select.replaceChildren(...(res.frames || []).map(item => new Option(`${item.index === 0 ? 'Trang chính' : 'Iframe ' + item.index}: ${item.url}`, String(item.index))));
  select.value = String(res.frame);
  output.value = res.html || '';
  Object.assign(modal.dataset, { ready: 'true', frame: String(res.frame) });
}

/**
 * Đóng bảng HTML.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniScreenCloseHtml() {
  const modal = document.getElementById('scrHtmlModal');
  modal.style.display = 'none';
  modal.dataset.request = String(Number(modal.dataset.request || 0) + 1);
}

/**
 * Sao chép HTML đang xem.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniScreenCopyHtml() {
  if (document.getElementById('scrHtmlModal').dataset.ready !== 'true') return;
  await miniScreenCopyText(document.getElementById('scrHtmlContent').value, 'Đã sao chép HTML');
}

/**
 * Tải HTML đang xem thành file (dùng cầu nối native của app nếu có, như desktop).
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniScreenDownloadHtml() {
  const modal = document.getElementById('scrHtmlModal');
  if (modal.dataset.ready !== 'true') return;
  const content = document.getElementById('scrHtmlContent').value;
  const filename = `autoleadpc-slot-${modal.dataset.slot}-frame-${modal.dataset.frame}.html`;
  const nativeSave = window.webkit?.messageHandlers?.autoleadDebugHtml;
  if (nativeSave) { nativeSave.postMessage({ html: content, filename }); return; }
  const url = URL.createObjectURL(new Blob([content], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Hiện cửa sổ trình duyệt của slot đang xem ra Desktop Mac (POST /browser/show/:slot).
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniScreenPopOut() {
  const slot = miniScreenSlot();
  if (!slot) return;
  const res = await miniScreenRequest(`/browser/show/${slot}`, { method: 'POST' });
  showToast(res.error ? 'Lỗi mở ra Desktop: ' + res.error : `Đã mở Slot ${slot} ra Desktop`);
}
