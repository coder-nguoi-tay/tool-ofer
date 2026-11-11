/**
 * Load help content.
 * @return {Promise<void>} Kết quả xử lý load help content.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadHelpContent() {
      const data = await api('/pc/help');
      if (data && data.helpText) {
        document.getElementById('richTextBoxHelp').value = data.helpText;
      }
    }
