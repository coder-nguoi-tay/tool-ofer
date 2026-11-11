/**
 * Lấy HTML mới nhất của frame đang chọn, chỉ hiển thị văn bản và không thực thi script của trang.
 * @param {number|string} frame Chỉ số frame cần xem; mặc định trang chính.
 * @return {Promise<void>} Hoàn tất tải HTML theo yêu cầu, không poll hoặc tạo log.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
async function _openScreenHtml(frame = 0) {
  const panel = document.getElementById('screenHtmlPanel');
  const output = document.getElementById('screenHtmlContent');
  const slot = _screenActiveSlot;
  if (!slot) return;
  const requestId = String(Number(panel.dataset.request || 0) + 1);
  panel.dataset.request = requestId;
  panel.style.display = 'flex';
  output.value = 'Đang đọc HTML...';
  panel.dataset.ready = 'false';
  document.getElementById('screenHtmlCopy').disabled = true;
  document.getElementById('screenHtmlDownload').disabled = true;
  try {
    const response = await fetch(`/screen/html/${slot}?frame=${Number(frame)}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    if (_screenActiveSlot !== slot || panel.dataset.request !== requestId) return;
    const select = document.getElementById('screenHtmlFrame');
    select.replaceChildren(...result.frames.map(item => new Option(`${item.index === 0 ? 'Trang chính' : 'Iframe ' + item.index}: ${item.url}`, String(item.index))));
    select.value = String(result.frame);
    output.value = result.html;
    panel.dataset.ready = 'true';
    document.getElementById('screenHtmlCopy').disabled = false;
    document.getElementById('screenHtmlDownload').disabled = false;
    panel.dataset.slot = String(slot);
    panel.dataset.frame = String(result.frame);
  } catch (error) {
    if (panel.dataset.request === requestId) output.value = error.message || 'Chưa đọc được HTML.';
  }
}
