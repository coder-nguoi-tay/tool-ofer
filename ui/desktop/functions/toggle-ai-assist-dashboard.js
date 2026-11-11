/**
 * Toggle ai assist dashboard.
 * @param {*} checked checked.
 * @return {Promise<void>} Kết quả xử lý toggle ai assist dashboard.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function toggleAiAssistDashboard(checked) {
      const modeSelect = document.getElementById('cbbAiMode');
      if (modeSelect) {
        modeSelect.value = checked ? 'auto_on_stuck' : 'disabled';
      }
      await saveAiConfig();
    }
