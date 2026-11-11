/**
 * Save browser config file.
 * @param {string} filename filename.
 * @param {string} textareaId textarea id.
 * @return {Promise<void>} Kết quả xử lý save browser config file.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function saveBrowserConfigFile(filename, textareaId) {
      const content = document.getElementById(textareaId).value;
      const res = await api('/pc/browser-config/save', { method: 'POST', body: JSON.stringify({ file: filename, content }) });
      if (res.success) {
        alert(`Saved ${filename} successfully!`);
      } else {
        alert('Error: ' + res.error);
      }
    }
