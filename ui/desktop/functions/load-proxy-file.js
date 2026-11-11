/**
 * Load proxy file.
 * @param {string} filename filename.
 * @param {string} textareaId textarea id.
 * @return {Promise<void>} Kết quả xử lý load proxy file.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadProxyFile(filename, textareaId) {
      const res = await api('/pc/config/read', { method: 'POST', body: JSON.stringify({ file: filename }) });
      if (res && res.content !== undefined) {
        document.getElementById(textareaId).value = res.content;
      }
    }
