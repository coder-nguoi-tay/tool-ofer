let globalAiConfig = {
  enabled: true,
  mode: 'auto_on_stuck',
  // 'auto_on_stuck' | 'continuous' | 'heuristic_only' | 'disabled'
  cliBinary: 'agy',
  useCodexMcp: false,
  // Bỏ Codex MCP, chuyển hẳn sang agy CLI tốc độ cao
  maxRounds: 20,
  timeoutSeconds: 100,
  solveBotQuiz: true,
  solveSurveyCards: true,
  clickJumpPage: true,
  multiStepSubmit: true,
  syncAutofill: true,
  customInstructions: ''
};
/**
 * Cập nhật trạng thái globalAiConfig và giữ liên kết export cho các nơi đang theo dõi.
 * @param {*} value Trạng thái mới.
 * @return {*} Trạng thái đã cập nhật.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function replaceGlobalAiConfig(value) {
  return globalAiConfig = value;
}
export { globalAiConfig, replaceGlobalAiConfig };
