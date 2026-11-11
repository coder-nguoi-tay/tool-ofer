/**
 * Regex lọc link/nút rác về pháp lý (Privacy, Terms, Cookie...) dùng chung toàn dự án.
 * Nguồn duy nhất của sự thật — tránh drift giữa survey-solver và autofill.
 *
 * @type {RegExp}
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-21
 */
const SURVEY_LEGAL_NOISE_RE = /privacy|terms|condition|policy|disclaimer|cookie|copyright|all rights reserved|do not sell|opt[- ]?out|unsubscribe|dmca|legal|disclosure/i;
export { SURVEY_LEGAL_NOISE_RE };
