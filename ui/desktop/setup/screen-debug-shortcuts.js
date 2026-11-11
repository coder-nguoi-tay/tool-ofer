/**
 * Nhận F12/Cmd+Option+I trong Screen View, giữ phím debug tại app thay vì gửi vào website.
 * @param {KeyboardEvent} event Phím người dùng vừa nhấn trong modal đang mở.
 * @return {void} Mở debug hoặc đóng bảng HTML bằng Escape.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
document.addEventListener('keydown', event => {
  const modal = document.getElementById('screenModal');
  if (!modal || modal.style.display === 'none' || modal.style.display === '') return;
  if (event.key === 'F12' || (event.metaKey || event.ctrlKey) && event.altKey && event.key.toLowerCase() === 'i') {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) void _openScreenDevtools();
  } else if (event.key === 'Escape' && document.getElementById('screenHtmlPanel').style.display !== 'none') {
    event.preventDefault();
    event.stopImmediatePropagation();
    document.getElementById('screenHtmlPanel').style.display = 'none';
  }
}, true);
