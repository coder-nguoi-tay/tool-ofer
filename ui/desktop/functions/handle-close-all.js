/**
 * Đóng tất cả qua cùng luồng Stop, bao gồm hủy lịch và hiển thị cảnh báo dừng native.
 * @return {Promise<void>} Kết quả xử lý handle close all.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
async function handleCloseAll() {
      await handleStop();
    }
