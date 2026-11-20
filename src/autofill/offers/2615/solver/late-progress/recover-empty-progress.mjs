// Bản giải riêng của offer 2615, chép từ src/autofill/late-progress/recover-empty-progress.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
import { shouldPauseForLead } from '../should-pause-for-lead.mjs';
import { readEmptyProgress } from './read-empty-progress.mjs';
import { getLateProgressRecoveryAction } from './get-recovery-action.mjs';
import { diagnoseEmptyProgress } from '../../../../../ai-assist/diagnose-empty-progress.mjs';
import { isThankYouUrl } from '../../../../../leads/actions/is-thank-you-url.mjs';

const recovering = new WeakSet();

/**
 * Phục hồi màn gần cuối bị trống và nhường tab khi người dùng đang xác minh CAPTCHA.
 * @param {object} page Tab đang quét, không áp dụng tab manual/skip/consent hoặc URL hoàn tất.
 * @param {object} session Phiên cần giữ nguyên lead/IP trong quá trình phục hồi.
 * @param {object} options Cấu hình và callback log của autofill.
 * @return {Promise<boolean>} True khi luồng này đang giữ màn trống để chờ/phục hồi.
 * @throws {Error} Khi việc kiểm tra trạng thái tab không hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function recoverEmptyProgress(page, session, options = {}) {
  if (page._manualCaptchaPending || recovering.has(page)) return true;
  if (session.isClosed || page.isClosed() || page._leadRecoveryInProgress || ['manual', 'skip', 'consent_only'].includes(session.offerMode) || shouldPauseForLead(session, options)) return false;
  const url = page.url();
  if (!/^https?:/.test(url) || isThankYouUrl(url)) { page._lateProgressRecoveryActive = false; return false; }
  const snapshot = await readEmptyProgress(page);
  if (page._manualCaptchaPending) return true;
  if (page.isClosed() || page.url() !== url) return false;
  const decision = getLateProgressRecoveryAction(page, url, snapshot);
  page._lateProgressRecoveryActive = decision.action !== 'none';
  if (decision.action === 'none') return false;
  if (!['reload', 'ai'].includes(decision.action)) return true;
  recovering.add(page);
  try {
    if (decision.action === 'reload') {
      options.onLog?.({ type: 'late_progress_reload', detail: `Màn 80–99% trống câu hỏi một phút; F5 lần ${decision.reloads}/2.` }, page);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
    } else {
      options.onLog?.({ type: 'late_progress_ai_requested', detail: 'Màn gần cuối vẫn trống sau hai lần F5 và một phút chờ; chuyển AI chẩn đoán.' }, page);
      await diagnoseEmptyProgress(page, session, snapshot, options);
    }
  } catch { options.onLog?.({ type: 'late_progress_reload_failed', detail: 'F5 chưa tải xong; giữ browser, đợi một phút trước bước phục hồi kế tiếp.' }, page); }
  finally { recovering.delete(page); }
  return true;
}
