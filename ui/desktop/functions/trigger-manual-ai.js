/**
 * Trigger manual ai.
 * @return {Promise<void>} Kết quả xử lý trigger manual ai.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function triggerManualAi() {
      const slot = document.getElementById('cbbAiManualSlot').value;
      document.getElementById('lbStatus').textContent = `Đang kích hoạt AI cho Slot ${slot}...`;

      const res = await api('/ai/trigger', {
        method: 'POST',
        body: JSON.stringify({ slot: Number(slot) }),
      });

      if (res && res.success) {
        document.getElementById('lbStatus').textContent = res.message;
        alert(res.message);
        switchTab('tabRunning');
      } else {
        alert(res.error || 'Lỗi khi kích hoạt AI');
      }
    }
