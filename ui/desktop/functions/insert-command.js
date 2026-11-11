/**
 * Insert command.
 * @param {*} cmd cmd.
 * @return {void} Kết quả xử lý insert command.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function insertCommand(cmd) {
      const textarea = document.getElementById('txtScript');
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      textarea.value = text.substring(0, start) + cmd + text.substring(end);
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + cmd.length;
    }
