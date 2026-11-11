/**
 * Copy to clipboard.
 * @param {string} text text.
 * @param {string} successMsg success msg.
 * @return {Promise<void>} Kết quả xử lý copy to clipboard.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function copyToClipboard(text, successMsg = 'Đã sao chép vào bộ nhớ tạm') {
      if (!text) return;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        showToast(successMsg, 'success');
      } catch (err) {
        console.error('Clipboard copy error:', err);
        showToast('Không thể sao chép: ' + (err.message || err), 'error');
      }
    }
