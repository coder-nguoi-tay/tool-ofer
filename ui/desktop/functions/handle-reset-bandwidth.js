/**
 * Handle reset bandwidth.
 * @param {*} scope scope.
 * @return {Promise<void>} Kết quả xử lý handle reset bandwidth.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function handleResetBandwidth(scope) {
      const confirmMsg = scope === 'today'
        ? 'Bạn có chắc chắn muốn đặt lại bộ đếm băng thông của ngày HÔM NAY về 0?'
        : 'CẢNH BÁO: Thao tác này sẽ XÓA TOÀN BỘ lịch sử thống kê băng thông tất cả các ngày!\n\nBạn có chắc chắn muốn tiếp tục?';
      if (!confirm(confirmMsg)) return;

      try {
        const res = await api('/bandwidth/reset', { scope });
        if (res && res.ok) {
          alert(res.message || 'Đã đặt lại dữ liệu băng thông.');
          fetchBandwidthStats();
          fetchRunningState();
        } else {
          alert('Lỗi: ' + (res?.error || 'Không thực hiện được.'));
        }
      } catch (err) {
        alert('Lỗi: ' + err.message);
      }
    }
