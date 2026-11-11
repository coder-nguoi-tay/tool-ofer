/**
 * Copy text to clipboard.
 * @param {string} text text.
 * @return {void} Kết quả xử lý copy text to clipboard.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function copyTextToClipboard(text) {
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          const lb = document.getElementById('lbStatus');
          if (lb) lb.textContent = `✓ Đã copy vào bộ nhớ tạm: ${text}`;
        }).catch(() => { });
      }
    }
