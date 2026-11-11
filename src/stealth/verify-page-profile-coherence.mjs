import { analyzeProfileCoherence } from './analyze-profile-coherence.mjs';
import { buildProfileCoherenceExpected } from './build-profile-coherence-expected.mjs';
import { collectProfileCoherenceSnapshot } from './collect-profile-coherence-snapshot.mjs';

/**
 * Kiểm tra và ghi log cảnh báo tính nhất quán profile trên một tab đang mở.
 *
 * @param {object} page Page Playwright.
 * @param {object} dp Cấu hình profile thiết bị.
 * @param {object} antiFingerprint Cấu hình anti-fingerprint.
 * @param {object} options Tuỳ chọn { timezoneId, languages, onLog, logger }.
 * @return {Promise<object>} Kết quả kiểm tra.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function verifyPageProfileCoherence(page, dp, antiFingerprint = {}, options = {}) {
  const expected = buildProfileCoherenceExpected(dp, antiFingerprint, options);
  const snapshot = await collectProfileCoherenceSnapshot(page);
  const analysis = analyzeProfileCoherence(snapshot, expected);
  if (!analysis.consistent) {
    const criticals = analysis.mismatches.filter(m => m.severity === 'critical' || m.severity === 'high');
    const logFn = options.onLog || options.logger;
    if (typeof logFn === 'function' && criticals.length > 0) {
      logFn({
        type: 'profile_coherence_warning',
        detail: `[Coherence Score ${analysis.score}/100] Cảnh báo lệch fingerprint: ${criticals.map(m => m.message).join('; ')}`
      });
    }
  }
  return {
    expected,
    snapshot,
    ...analysis
  };
}
export { verifyPageProfileCoherence };
