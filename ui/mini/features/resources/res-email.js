/**
 * Đọc file .txt/.csv người dùng chọn vào ô nhập email (bấm "Nạp Email" để đưa vào hàng đợi).
 * @param {HTMLInputElement} input Ô chọn file.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniResReadEmailFile(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const text = await file.text();
  document.getElementById('taEmailInput').value = text;
  const count = text.split('\n').filter((l) => l.trim()).length;
  showToast(`Đã đọc ${count} dòng từ ${file.name}. Bấm "Nạp Email" để thêm vào hàng đợi.`);
}

/**
 * Xoá toàn bộ email (cả sẵn sàng và đã dùng) sau khi người dùng xác nhận.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniResClearEmail() {
  if (!confirm('Xoá TẤT CẢ email trong hàng đợi (cả sẵn sàng và đã dùng)?')) return;
  const res = await miniResApi('/email-queue/clear', {});
  if (res.error) { alert('Lỗi: ' + res.error); return; }
  showToast(res.message || 'Đã xoá tất cả email.');
  miniResLoadEmailList();
  pollResources();
}

/**
 * Hiển thị danh sách email sẵn sàng hiện có trong hàng đợi.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniResLoadEmailList() {
  const data = await miniResApi('/email-queue');
  if (data.error) return;
  const list = data.availableList || [];
  document.getElementById('resEmailListCount').textContent = `${list.length} sẵn sàng · ${data.used || 0} đã dùng`;
  document.getElementById('resEmailList').value = list.join('\n');
}

/**
 * Nạp cấu hình tự động nạp email (bật/tắt, đường dẫn file, số dòng mỗi lần).
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniResLoadEmailAutoRefill() {
  const data = await miniResApi('/email-queue/autorefill');
  if (data.error) return;
  document.getElementById('resEmailAutoRefill').checked = !!data.enabled;
  document.getElementById('resEmailAutoRefillPath').value = data.sourcePath || '';
  document.getElementById('resEmailAutoRefillBatch').value = data.batchSize || 1000;
}

/**
 * Lưu cấu hình tự động nạp email từ file trên máy chạy app.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniResSaveEmailAutoRefill() {
  const res = await miniResApi('/email-queue/autorefill', {
    enabled: document.getElementById('resEmailAutoRefill').checked,
    sourcePath: document.getElementById('resEmailAutoRefillPath').value.trim(),
    batchSize: parseInt(document.getElementById('resEmailAutoRefillBatch').value) || 1000,
  });
  showToast(res.error || res.message || 'Đã lưu cấu hình tự động nạp email.');
}

/**
 * Nạp ngay một lô email từ file nguồn (đường dẫn trên máy chạy app).
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniResLoadEmailFromPath() {
  const res = await miniResApi('/email-queue/load-from-path', {
    sourcePath: document.getElementById('resEmailAutoRefillPath').value.trim(),
    batchSize: parseInt(document.getElementById('resEmailAutoRefillBatch').value) || 1000,
  });
  if (res.error) alert(res.error);
  else showToast(res.message);
  miniResLoadEmailList();
  pollResources();
}

/**
 * Đưa vị trí đọc file nguồn email về đầu file.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniResResetEmailCursor() {
  await miniResApi('/email-queue/autorefill', { resetCursor: true });
  showToast('Đã reset vị trí đọc về đầu file.');
}
