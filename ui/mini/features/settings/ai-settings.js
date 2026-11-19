/** Cấu hình AI đã nạp/lưu gần nhất; null = chưa đọc được từ máy chủ. */
let miniSetAiConfig = null;

/** Cấu hình AI mặc định, giống nút Khôi phục của desktop. */
const MINI_SET_DEFAULT_AI_CONFIG = {
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

/** Checkbox Smart Fallback: khóa cấu hình → id phần tử. */
const MINI_SET_AI_FLAGS = {
  solveBotQuiz: 'setAiSolveBotQuiz',
  solveSurveyCards: 'setAiSolveSurveyCards',
  clickJumpPage: 'setAiClickJumpPage',
  multiStepSubmit: 'setAiMultiStepSubmit',
  syncAutofill: 'setAiSyncAutofill',
};

/**
 * Đổ cấu hình AI lên form; timeout hiển thị đúng giá trị đã lưu (không giới hạn 15s như desktop cũ).
 * @param {object} cfg Cấu hình AI.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniSetApplyAiForm(cfg) {
  const set = (id, prop, value) => { const el = document.getElementById(id); if (el) el[prop] = value; };
  set('setAiMode', 'value', cfg.mode || 'auto_on_stuck');
  set('setAiBinary', 'value', cfg.cliBinary || 'agy');
  set('setAiMaxRounds', 'value', cfg.maxRounds || 20);
  set('setAiTimeout', 'value', Number(cfg.timeoutSeconds) || 100);
  for (const [key, id] of Object.entries(MINI_SET_AI_FLAGS)) set(id, 'checked', cfg[key] !== false);
  set('setAiInstructions', 'value', cfg.customInstructions || '');
  if (typeof syncOptionPills === 'function') syncOptionPills();
}

/**
 * Đọc form AI thành body gửi POST /ai/config (cùng trường với desktop saveAiConfig).
 * @return {object} Cấu hình AI.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniSetReadAiForm() {
  const val = id => document.getElementById(id)?.value ?? '';
  const mode = val('setAiMode') || 'auto_on_stuck';
  const cfg = {
    enabled: mode !== 'disabled',
    mode,
    cliBinary: val('setAiBinary') || 'agy',
    maxRounds: parseInt(val('setAiMaxRounds'), 10) || 20,
    timeoutSeconds: Math.max(5, Math.min(parseInt(val('setAiTimeout'), 10) || 100, 300)),
    customInstructions: val('setAiInstructions'),
  };
  for (const [key, id] of Object.entries(MINI_SET_AI_FLAGS)) cfg[key] = miniSetChecked(id, true);
  return cfg;
}

/**
 * Nạp cấu hình AI (GET /ai/config) vào form và bộ nhớ.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniSetLoadAi() {
  const cfg = await miniSetApi('/ai/config');
  if (!cfg || cfg.error) return;
  miniSetAiConfig = cfg;
  miniSetApplyAiForm(cfg);
}

/**
 * Gửi cấu hình AI lên máy chủ và ghi nhớ khi thành công.
 * @param {object} cfg Cấu hình AI đầy đủ.
 * @param {string} okText Thông báo khi lưu thành công.
 * @return {Promise<boolean>} true khi lưu thành công.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniSetPostAi(cfg, okText) {
  const res = await miniSetApi('/ai/config', { method: 'POST', body: JSON.stringify(cfg) });
  if (!res?.success) {
    miniSetStatus('setAiStatus', 'Lỗi lưu cấu hình: ' + (res?.error || 'Thất bại'), false);
    return false;
  }
  miniSetAiConfig = cfg;
  miniSetStatus('setAiStatus', okText, true);
  return true;
}

/**
 * Lưu cấu hình AI từ form.
 * @return {Promise<boolean>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniSetSaveAi() {
  return miniSetPostAi(miniSetReadAiForm(), 'Đã lưu cấu hình AI.');
}

/**
 * Khôi phục cấu hình AI mặc định (kể cả xóa chỉ dẫn tùy chỉnh) rồi nạp lại form.
 * @return {Promise<boolean>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniSetResetAi() {
  const ok = await miniSetPostAi({ ...MINI_SET_DEFAULT_AI_CONFIG }, 'Đã khôi phục cài đặt AI mặc định.');
  if (ok) await miniSetLoadAi();
  return ok;
}

/**
 * Kiểm tra CLI AI (POST /ai/test) với binary đang chọn.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniSetTestAi() {
  miniSetStatus('setAiTestResult', 'Đang kiểm tra kết nối & gửi prompt thử...');
  const binary = document.getElementById('setAiBinary')?.value || 'agy';
  const res = await miniSetApi('/ai/test', { method: 'POST', body: JSON.stringify({ binary }) });
  if (res?.success) miniSetStatus('setAiTestResult', res.message || `✓ Kết nối thành công! ${res.binary} (${res.version})`, true);
  else miniSetStatus('setAiTestResult', `✗ ${res?.message || res?.error || 'Không kết nối được'}`, false);
}

/**
 * AI Assist có đang bật theo cấu hình đã nạp hay không (mặc định bật khi chưa nạp được).
 * @return {boolean}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniSetIsAiAssistEnabled() {
  const cfg = miniSetAiConfig || MINI_SET_DEFAULT_AI_CONFIG;
  return cfg.enabled !== false && cfg.mode !== 'disabled';
}

/**
 * Bật/tắt AI Assist như desktop toggleAiAssistDashboard: đổi chế độ điều khiển biểu mẫu hoặc autofill rồi lưu toàn bộ form.
 * Nạp cấu hình trước nếu chưa có để không ghi đè chỉ dẫn tùy chỉnh bằng giá trị mặc định.
 * @param {boolean} enabled true = bật (form_agent), false = tắt (disabled).
 * @return {Promise<boolean>} true khi lưu thành công.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function miniSetSetAiAssistEnabled(enabled) {
  if (!miniSetAiConfig) await miniSetLoadAi();
  if (!miniSetAiConfig) { showToast('Chưa đọc được cấu hình AI, thử lại sau.'); return false; }
  const modeEl = document.getElementById('setAiMode');
  if (modeEl) modeEl.value = enabled ? 'form_agent' : 'disabled';
  const cfg = { ...miniSetReadAiForm(), enabled: Boolean(enabled), mode: enabled ? 'form_agent' : 'disabled' };
  return miniSetPostAi(cfg, enabled ? 'Đã bật AI Assist.' : 'Đã tắt AI Assist.');
}
