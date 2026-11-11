/**
 * Reset auto refill cursor.
 * @return {Promise<void>} Kết quả xử lý reset auto refill cursor.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function resetAutoRefillCursor() {
      await api('/email-queue/autorefill', { method: 'POST', body: JSON.stringify({ resetCursor: true }) });
      showWinAlert('Đã reset vị trí đọc về đầu file.');
    }
