/**
     * Nạp cấu hình AI và đồng bộ giới hạn timeout của watchdog.
     * @return {Promise<void>} Hoàn tất khi cấu hình được nạp vào giao diện.
     * @throws {Error} Khi API đọc cấu hình không phản hồi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadAiConfigUi() {
      const cfg = await api('/ai/config');
      if (!cfg || cfg.error) return;

      if (document.getElementById('cbbAiMode')) document.getElementById('cbbAiMode').value = cfg.mode || 'auto_on_stuck';
      if (document.getElementById('cbbAiBinary')) document.getElementById('cbbAiBinary').value = cfg.cliBinary || 'agy';
      if (document.getElementById('nudAiMaxRounds')) document.getElementById('nudAiMaxRounds').value = cfg.maxRounds || 20;
      if (document.getElementById('nudAiTimeout')) document.getElementById('nudAiTimeout').value = Math.min(Number(cfg.timeoutSeconds) || 15, 15);

      if (document.getElementById('chkSolveBotQuiz')) document.getElementById('chkSolveBotQuiz').checked = cfg.solveBotQuiz !== false;
      if (document.getElementById('chkSolveSurveyCards')) document.getElementById('chkSolveSurveyCards').checked = cfg.solveSurveyCards !== false;
      if (document.getElementById('chkClickJumpPage')) document.getElementById('chkClickJumpPage').checked = cfg.clickJumpPage !== false;
      if (document.getElementById('chkMultiStepSubmit')) document.getElementById('chkMultiStepSubmit').checked = cfg.multiStepSubmit !== false;
      if (document.getElementById('chkSyncAutofill')) document.getElementById('chkSyncAutofill').checked = cfg.syncAutofill !== false;

      if (document.getElementById('txtAiCustomInstructions')) document.getElementById('txtAiCustomInstructions').value = cfg.customInstructions || '';
      if (document.getElementById('cbxAiAssist')) document.getElementById('cbxAiAssist').checked = cfg.enabled !== false && cfg.mode !== 'disabled';
    }
