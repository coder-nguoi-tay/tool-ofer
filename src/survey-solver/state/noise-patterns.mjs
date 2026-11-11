/**
 * Các từ khóa nhận diện link/nút rác (Legal, Footer, Disclaimer, Nav, Login) cần loại trừ
 */
const NOISE_PATTERNS = [/privacy/i, /\bterms\b/i, /\bcondition(s)?\b/i, /\bpolicy\b/i, /disclaimer/i, /\bcookie(s)?\b/i, /copyright/i, /all rights reserved/i, /do not sell/i, /opt[- ]?out/i, /unsubscribe/i, /dmca/i, /\blegal\b/i, /disclosure/i, /sign in/i, /sign up/i, /\blogin\b/i, /\blog in\b/i, /\bregister\b/i, /my account/i, /^(home|homepage)$/i, /\b(home\s*page|back to home)\b/i, /\b(menu|main menu)\b/i, /\b(cart|view cart|shopping cart)\b/i, /\b(portal|client portal)\b/i, /contact us/i, /about us/i, /\b(help & faq|help center|faqs?)\b/i];
export { NOISE_PATTERNS };
