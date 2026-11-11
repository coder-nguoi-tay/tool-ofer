/**
 * Load browser config file.
 * @param {string} filename filename.
 * @param {string} textareaId textarea id.
 * @return {Promise<void>} Kết quả xử lý load browser config file.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadBrowserConfigFile(filename, textareaId) {
      const res = await api('/pc/browser-config/read', { method: 'POST', body: JSON.stringify({ file: filename }) });
      if (res && res.content !== undefined) {
        document.getElementById(textareaId).value = res.content;
      }
    }
