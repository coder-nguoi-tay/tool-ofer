/**
     * Mở Google Chrome thường qua proxy theo cấu hình hiện tại.
     * @param {SubmitEvent} event Sự kiện gửi cấu hình mở trình duyệt.
     * @return {void} Không trả về giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function handleLauncherSubmit(event) {
      event.preventDefault();
      activateTab('browsers');
      send('/launch', 'Đang mở Google Chrome thường qua proxy…');
    }
