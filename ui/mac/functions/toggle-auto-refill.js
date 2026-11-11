/**
     * Bật hoặc tắt việc tự mở profile thay thế.
     * @return {Promise<void>} Hoàn tất khi máy chủ cập nhật trạng thái.
 * @throws {Error} Khi dữ liệu không hợp lệ hoặc thao tác không thể hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function toggleAutoRefill() {
      autoRefillButton.disabled = true;
      try {
        const response = await fetch('/auto-refill', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: !autoRefillEnabled }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        await refreshAutoRefillState();
      } catch (error) {
        autoRefillStatus.textContent = error.message;
      } finally {
        autoRefillButton.disabled = false;
      }
    }
