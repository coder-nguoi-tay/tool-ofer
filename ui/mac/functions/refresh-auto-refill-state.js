/**
     * Làm mới trạng thái tự bù để phản ánh cả các profile được mở nền.
     * @return {Promise<void>} Hoàn tất khi đã cập nhật trạng thái.
 * @throws {Error} Khi dữ liệu không hợp lệ hoặc thao tác không thể hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function refreshAutoRefillState() {
      if (isRefreshingAutoRefillState) return;
      isRefreshingAutoRefillState = true;
      try {
        const response = await fetch('/state');
        if (!response.ok) throw new Error('Không đọc được trạng thái tự bù.');
        renderAutoRefillState(await response.json());
      } catch (error) {
        autoRefillStatus.textContent = error.message;
      } finally {
        isRefreshingAutoRefillState = false;
      }
    }
