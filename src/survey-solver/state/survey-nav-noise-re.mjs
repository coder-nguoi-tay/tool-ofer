/**
 * Regex lọc noise điều hướng/menu (Sign in, Cart, Portal...) dùng chung toàn dự án.
 * Nguồn duy nhất của sự thật — tránh drift giữa survey-solver và autofill.
 *
 * @type {RegExp}
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-21
 */
const SURVEY_NAV_NOISE_RE = /sign in|sign up|\blogin\b|\blog in\b|\bregister\b|my account|^(home|homepage)$|\bhome\s*page\b|\b(menu|main menu)\b|\b(cart|shopping cart)\b|\bportal\b|contact us|about us|\b(help & faq|faqs?)\b/i;
export { SURVEY_NAV_NOISE_RE };
