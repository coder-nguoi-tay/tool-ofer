/**
     * Lưu cấu hình AI với timeout tối đa 15 giây để watchdog chuyển sang fallback kịp thời.
     * @return {Promise<void>} Hoàn tất khi cấu hình đã được lưu.
     * @throws {Error} Khi API lưu cấu hình không phản hồi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function saveAiConfig() {
      const cfg = {
        enabled: document.getElementById('cbxAiAssist') ? document.getElementById('cbxAiAssist').checked : true,
        mode: document.getElementById('cbbAiMode').value,
        cliBinary: document.getElementById('cbbAiBinary').value,
        maxRounds: parseInt(document.getElementById('nudAiMaxRounds').value) || 20,
        timeoutSeconds: Math.max(5, Math.min(parseInt(document.getElementById('nudAiTimeout').value, 10) || 100, 300)),
        solveBotQuiz: document.getElementById('chkSolveBotQuiz').checked,
        solveSurveyCards: document.getElementById('chkSolveSurveyCards').checked,
        clickJumpPage: document.getElementById('chkClickJumpPage').checked,
        multiStepSubmit: document.getElementById('chkMultiStepSubmit').checked,
        syncAutofill: document.getElementById('chkSyncAutofill').checked,
        customInstructions: document.getElementById('txtAiCustomInstructions').value,
      };

      const res = await api('/ai/config', {
        method: 'POST',
        body: JSON.stringify(cfg),
      });

      const statusEl = document.getElementById('aiConfigSaveStatus');
      if (res && res.success) {
        statusEl.textContent = 'Đã lưu cấu hình AI thành công!';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
      } else {
        statusEl.textContent = 'Lỗi lưu cấu hình: ' + (res.error || 'Thất bại');
      }
    }
