import { globalAiConfig } from './state/global-ai-config.mjs';
import { moduleState } from './state/module-state.mjs';
import { waitForAiCapacity } from './wait-for-ai-capacity.mjs';
import { readVisiblePageState } from './visible-state/read-visible-page-state.mjs';
import { callAgt } from './call-agt.mjs';
import { resolveAiTimeoutSeconds } from './resolve-ai-timeout-seconds.mjs';

/**
 * Gọi AI chẩn đoán widget trống sau hai reload mà không yêu cầu click control không tồn tại.
 * @param {object} page Tab cần chẩn đoán, không reload/đóng từ nhánh AI này.
 * @param {object} session Phiên để ưu tiên IP có lead và kiểm tra đóng.
 * @param {object} snapshot Chỉ số progress/iframe/trạng thái tải, không chứa dữ liệu form/token.
 * @param {object} options Cấu hình AI và callback log.
 * @return {Promise<void>} Hoàn tất một lượt chẩn đoán, luôn trả lại chỗ AI đã acquired.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function diagnoseEmptyProgress(page, session, snapshot, options) {
  const config = { ...globalAiConfig, ...options.aiConfig };
  if (!config.enabled || ['disabled', 'heuristic_only'].includes(config.mode)) {
    options.onLog?.({ type: 'late_progress_ai_disabled', detail: 'Đã thử hai lần F5; AI chưa bật, giữ trang và chờ kiểm tra.' }, page); return;
  }
  let acquired = false;
  page._aiAssistRunning = true;
  try {
    const state = await readVisiblePageState(page);
    const capacity = await waitForAiCapacity(page, session, state.signature);
    if (capacity !== 'acquired') {
      options.onLog?.({ type: 'late_progress_ai_waiting', detail: 'Chưa có lượt AI hoặc trang đã đổi; giữ tab, không lặp F5 thêm.' }, page); return;
    }
    acquired = true;
    const raw = await callAgt(`Trang survey đứng ở 80–99%, không còn control hiển thị sau hai lần reload. Chẩn đoán từ trạng thái cấu trúc sau, không bịa nút, không chỉ định submit. Trả JSON {"reason":"loading_frame|waiting_widget|network|unknown"}.\n${JSON.stringify(snapshot)}`, { cliBinary: config.cliBinary, timeoutSeconds: resolveAiTimeoutSeconds(config.timeoutSeconds) });
    const reason = ['loading_frame', 'waiting_widget', 'network'].find(value => raw.includes(value)) || 'unknown';
    const reasons = { loading_frame: 'iframe chưa tải xong', waiting_widget: 'widget chưa hiển thị bước kế', network: 'có thể gián đoạn tải tài nguyên', unknown: 'chưa đủ bằng chứng xác định nguyên nhân' };
    options.onLog?.({ type: 'late_progress_ai_diagnosed', detail: `AI chẩn đoán màn trống: ${reasons[reason]}; giữ trang, autofill tiếp tục khi câu hỏi xuất hiện.` }, page);
  } catch { options.onLog?.({ type: 'late_progress_ai_failed', detail: 'AI chưa chẩn đoán được màn trống; giữ browser mở, không tiếp tục lặp reload.' }, page); }
  finally {
    if (acquired) moduleState.agtRunningCount = Math.max(0, moduleState.agtRunningCount - 1);
    page._aiAssistRunning = false;
  }
}
