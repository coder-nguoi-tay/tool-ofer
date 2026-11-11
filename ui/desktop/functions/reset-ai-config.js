/**
     * Khôi phục cấu hình AI mặc định phù hợp với watchdog 5 giây.
     * @return {Promise<void>} Hoàn tất khi cấu hình mặc định được lưu và hiển thị.
     * @throws {Error} Khi API lưu cấu hình mặc định không phản hồi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function resetAiConfig() {
      const defaultCfg = {
        enabled: true,
        mode: 'auto_on_stuck',
        cliBinary: 'agy',
        maxRounds: 20,
        timeoutSeconds: 100,
        solveBotQuiz: true,
        solveSurveyCards: true,
        clickJumpPage: true,
        multiStepSubmit: true,
        syncAutofill: true,
        customInstructions: '',
      };
      await api('/ai/config', {
        method: 'POST',
        body: JSON.stringify(defaultCfg),
      });
      await loadAiConfigUi();
      const statusEl = document.getElementById('aiConfigSaveStatus');
      statusEl.textContent = 'Đã khôi phục cài đặt AI mặc định!';
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    }
