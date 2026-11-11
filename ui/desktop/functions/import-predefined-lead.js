/**
 * Import predefined lead.
 * @param {*} type type.
 * @return {Promise<void>} Kết quả xử lý import predefined lead.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function importPredefinedLead(type) {
      let filePath = '';
      let label = '';
      if (type === 'zip5') {
        filePath = '/Users/codernguoitay/Downloads/json_full_da_loai_zipcode_4_ky_tu.json';
        label = '1.060 Lead mới (Zip 5 số)';
      } else {
        filePath = '/Users/codernguoitay/Downloads/INFO NEW/info-new-autofill.json';
        label = '7.135 Lead đầy đủ';
      }
      if (!confirm(`Bạn có muốn nạp bộ dữ liệu [${label}] và làm mới hàng đợi Autofill không?`)) return;
      document.getElementById('lbStatus').textContent = `Đang nạp ${label}...`;
      const res = await api('/autofill-queue/import', {
        method: 'POST',
        body: JSON.stringify({ filePath, replace: true })
      });
      if (res && res.success) {
        showWinAlert(res.message);
        document.getElementById('lbStatus').textContent = res.message;
        await loadAutofillList();
      } else {
        showWinAlert('Lỗi nạp lead: ' + (res?.error || 'Không xác định'));
      }
    }
