/**
 * Regex lọc link/nút rác về pháp lý (Privacy, Terms, Cookie...) dùng chung toàn dự án.
 * Nguồn duy nhất của sự thật — tránh drift giữa survey-solver và autofill.
 *
 * @type {RegExp}
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-21
 */
// polic(y|ies): href thật là /policies/...; program requirements / biometric: trang chính sách offer (log 2026-11-11).
const SURVEY_LEGAL_NOISE_RE = /privacy|terms|condition|polic(?:y|ies)|disclaimer|cookie|copyright|all rights reserved|do not sell|opt[- ]?out|unsubscribe|dmca|legal|disclosure|program requirements|biometric/i;
export { SURVEY_LEGAL_NOISE_RE };
