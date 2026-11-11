/**
 *  stop thumb polling.
 * @return {void} Kết quả xử lý  stop thumb polling.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function _stopThumbPolling() {
      if (_thumbPollTimer) { clearInterval(_thumbPollTimer); _thumbPollTimer = null; }
    }
