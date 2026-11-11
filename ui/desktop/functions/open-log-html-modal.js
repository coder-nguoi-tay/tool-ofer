/**
 * Open log html modal.
 * @param {number} rowIndex row index.
 * @return {void} Kết quả xử lý open log html modal.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function openLogHtmlModal(rowIndex) {
      const rowItem = window.__currentLogRows?.[rowIndex];
      if (!rowItem) return;
      const { entry } = rowItem;
      document.getElementById('logModalTitle').textContent = `HTML Snapshot - ${entry.url || 'Page Source'}`;
      document.getElementById('logModalUrl').textContent = entry.url || '';
      document.getElementById('logModalPre').textContent = entry.html || '<!-- Không có nội dung HTML -->';

      const fileBar = document.getElementById('logModalFileBar');
      const filePathEl = document.getElementById('logModalFilePath');
      if (entry.htmlPath) {
        filePathEl.textContent = `📁 File: ${entry.htmlPath}`;
        fileBar.style.display = 'block';
        window.__currentLogModalFilePath = entry.htmlPath;
      } else {
        fileBar.style.display = 'none';
        window.__currentLogModalFilePath = '';
      }

      document.getElementById('logHtmlModalWin').style.display = 'flex';
    }
