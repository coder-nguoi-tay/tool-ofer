/**
 * Save lead custom cookie.
 * @return {void} Kết quả xử lý save lead custom cookie.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function saveLeadCustomCookie() {
      const val = (document.getElementById('leadCustomCookie')?.value || '').trim();
      if (val) {
        localStorage.setItem('toffers_custom_cookie', val);
        showWinAlert('Đã lưu Cookie toffers.top!');
        fetchToffersLeads(true);
      }
    }
