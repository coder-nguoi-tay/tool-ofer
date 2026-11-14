/**
 * Nạp bộ lead dựng sẵn trên máy chạy app và thay toàn bộ hàng đợi Autofill (giống desktop).
 * @param {string} type `zip5` (1.060 lead zip 5 số) hoặc `full7k` (7.135 lead đầy đủ).
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniResImportPredefinedLead(type) {
  // Đường dẫn cố định giống desktop import-predefined-lead.js (file nằm trên máy Mac chạy app).
  const preset = type === 'zip5'
    ? { filePath: '/Users/codernguoitay/Downloads/json_full_da_loai_zipcode_4_ky_tu.json', label: '1.060 Lead mới (Zip 5 số)' }
    : { filePath: '/Users/codernguoitay/Downloads/INFO NEW/info-new-autofill.json', label: '7.135 Lead đầy đủ' };
  if (!confirm(`Nạp bộ dữ liệu [${preset.label}] và THAY TOÀN BỘ hàng đợi Autofill?`)) return;
  showToast(`Đang nạp ${preset.label}...`);
  const res = await miniResApi('/autofill-queue/import', { filePath: preset.filePath, replace: true });
  if (!res.success) { alert('Lỗi nạp lead: ' + (res.error || 'Không xác định')); return; }
  showToast(res.message);
  miniResLoadAutofillList();
  pollResources();
}

/**
 * Hiển thị bảng gọn các hồ sơ Autofill sẵn sàng (server trả tối đa 100 bản ghi đầu).
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniResLoadAutofillList() {
  const data = await miniResApi('/autofill-queue');
  const list = data.availableList || [];
  document.getElementById('resAutofillListCount').textContent = `${list.length}/${data.available || 0} bản ghi đầu`;
  const tbody = document.getElementById('resAutofillListBody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:12px; color:var(--text-muted);">Chưa có dữ liệu Autofill hoặc hàng đợi đã hết.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map((item, idx) => {
    const name = `${item.firstname || item.first_name || item.fName || ''} ${item.lastname || item.last_name || item.lName || ''}`;
    const dob = [item.birthmonth || item.bMonth, item.birthday || item.bDay, item.birthyear || item.bYear].filter(Boolean).join('/');
    const phone = item.phone || item.phonenumber || item.cellphone || '';
    const place = `${item.city || ''} ${item.state || item.stateorprovince || ''} ${item.zipcode || item.zip || item.ziporpostcode || item.zip_code || ''}`;
    const cells = [idx + 1, name, dob, phone, place].map((v) => `<td style="padding:3px 6px; white-space:nowrap;">${escHtml(String(v).trim())}</td>`);
    return `<tr>${cells.join('')}</tr>`;
  }).join('');
}
