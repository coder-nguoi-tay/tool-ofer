import { resolveActiveFormScope } from './form-scope/resolve-active-form-scope.mjs';
import { findScopedSubmitButton } from './form-scope/find-scoped-submit-button.mjs';
import { SUBMIT_SCAN_VIEWPORTS } from './state/submit-scan-viewports.mjs';
import { SURVEY_LEGAL_NOISE_RE } from '../survey-solver/state/survey-legal-noise-re.mjs';

/**
 * Tìm nút gửi (Submit / Continue / Next) trên trang hoặc frame.
 * Ưu tiên phạm vi form đang điền; chỉ dùng vùng đầu trang khi không có form/container.
 *
 * @param {object} frame Frame hoặc Page của Playwright.
 * @param {object|null} formScope Phạm vi đã xác minh hoặc tự xác định nếu bỏ trống.
 * @return {Promise<object|null>} Locator của nút submit hoặc null nếu không tìm thấy.
 * @throws {never} Lỗi locator được xử lý tại từng selector.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function findSubmitButton(frame, formScope) {
  const activeScope = formScope === undefined ? await resolveActiveFormScope(frame) : formScope;
  if (activeScope) return findScopedSubmitButton(frame, activeScope);
  const candidateSelectors = [
  // 1. Nút Submit / Continue theo data- attributes chuẩn của Funnel, Vector & Lead forms (chỉ chọn thẻ tương tác, không chọn generic container)
  '#sub-btn, div#sub-btn, .sbtn, div.sbtn, div#sub-btn.sbtn', '[data-action="email-continue"], [data-action="continue"], [data-action*="continue"], div.btn[data-action="email-continue"], div[role="button"][data-action="email-continue"]', 'button[data-vector-submit="true"], button[data-vector-submit], a[data-vector-submit="true"], a[data-vector-submit], input[data-vector-submit="true"], [role="button"][data-vector-submit="true"]', 'button[data-tf-element-role="submit"], a[data-tf-element-role="submit"], [role="button"][data-tf-element-role="submit"]', 'button#submit-button, a#submit-button, input#submit-button, button#btn-submit, button#submit-btn, button#submit, button#continue, button#btnSubmit, button#btnNext, button#btnContinue, a#btn-submit, a#continue, a#btnSubmit, input#btnSubmit', 'button.ai-submit-button, button.ai-submit-button--question, button.ai-submit-button--multiselect, button.ai-submit-button--form, button[data-testid="ai-submit-button"], button.ai-button--submit, button[class*="ai-submit-button"], .ai-submit-button, button.submit-button, button[id^="ct-creative-submit-"], a[id^="ct-creative-submit-"], .ct-creative-submit, button[data-mock-action="next-page"]',
  // 2. Thẻ submit tiêu chuẩn của HTML (bao gồm nút mặc định submit trong thẻ form)
  'button[type="submit"]', 'input[type="submit"]', 'form button:not([type="button"]):not([type="reset"])', 'form button[type="submit"]', 'form input[type="submit"]', 'input[type="button"][value*="Continue" i], input[type="button"][value*="Submit" i], input[type="button"][value*="Next" i]',
  // 3. Nút bấm theo class phổ biến (bao gồm Jump Page, CTA button màn 5, màn Reward, LocoTomato Widget, div.button, .btn-option)
  'button.continue-btn, button.continue-button, button.submit-btn, button.btn-submit, button.btn-continue, button.btn-next, button.next-btn, button.next-button, button.btn-primary, button.arc-confirm-btn, button.blue-button, button.track-button, button.step-submit, button.forward-btn, button.btn-step, button.cta-button, button.rjp-cta-button, button.sjp-cta-button, button.cta-btn', '#twy-buttonnext, [id^="twy-buttonnext-"], .twy-buttonnext, .Buttons .Next a, a.Next, .Buttons a.Next, .thankyou-button, .thankyou-actions a', 'button.loco-btn, button.loco-submit, button.loco-next, button[data-loco-role="submit"], button[data-loco-action="submit"], a.loco-btn, a.loco-submit, .loco-submit-btn, .loco-btn-primary, [data-loco-role="submit"]', 'form button.btn, form button.button, form button[class*="primary"], form button[class*="submit"], form button[class*="continue"]', 'a.continue-btn, a.continue-button, a.submit-btn, a.btn-submit, a.btn-continue, a.btn-next, a.next-btn, a.button-next, a.btn-primary, a.arc-confirm-btn, a.forward-step, a.cta-button, a.rjp-cta-button, a.sjp-cta-button, a.cta-btn', '[role="button"].continue-btn, [role="button"].continue-button, [role="button"].btn-continue, [role="button"].btn-next, [role="button"].next-btn, [role="button"].btn-primary, [role="button"].cta-button, [role="button"].rjp-cta-button', 'div.continue-btn, div.continue-button, div.btn-continue, div.btn-next, div.next-btn, div.submit-btn, div.button-next, div.forward-step, .cta-button, .rjp-cta-button, .sjp-cta-button', 'div.btn-option, div.button, div.btn, div.inut, div.input, [id="btn-option"], [id^="btn-option"], [id*="btn-option"], .btn-option, button.btn-option, a.btn-option', 'a[href*="/next"], a[aria-label*="Reward" i], a[aria-label*="Get My" i], a[aria-label*="Continue" i], a[aria-label*="Claim" i], button[aria-label*="Reward" i], button[aria-label*="Get My" i]',
  // 4. Nút bấm theo text phổ biến (tiếng Anh & tiếng Việt, bao gồm Jump Page Get My Reward, Free Guide của LocoTomato)
  'button:has-text("Continue"), button:has-text("Submit"), button:has-text("Next"), button:has-text("Agree & Submit"), button:has-text("AGREE & CONTINUE"), button:has-text("Agree & Continue"), button:has-text("Tiếp tục"), button:has-text("Get Quote"), button:has-text("Get My Quote"), button:has-text("Agree"), button:has-text("Tiếp theo"), button:has-text("Xác nhận"), button:has-text("Get Started"), button:has-text("See My Results"), button:has-text("View My Results"), button:has-text("Check My Rate"), button:has-text("Claim Now"), button:has-text("Proceed"), button:has-text("Finish"), button:has-text("Complete"), button:has-text("Explore Plans"), button:has-text("Check Options"), button:has-text("Hoàn thành"), button:has-text("Get My Reward"), button:has-text("Claim Reward"), button:has-text("Claim My Reward"), button:has-text("Get Reward"), button:has-text("Unlock Reward"), button:has-text("View Deals"), button:has-text("Continue to Deals"), button:has-text("View Offers"), button:has-text("See Offers"), button:has-text("Check Eligibility"), button:has-text("See Matches"), button:has-text("Show Matches"), button:has-text("Send"), button:has-text("Sign Up"), button:has-text("Sign-Up"), button:has-text("Sign Up Now"), button:has-text("Register"), button:has-text("Register Now"), button:has-text("Join Now"), button:has-text("Join Free"), button:has-text("Enter Now"), button:has-text("Enter to Win"), button:has-text("Start Now"), button:has-text("Apply Now"), button:has-text("Start"), button:has-text("Free Quote"), button:has-text("Request Quote"), button:has-text("Next Step"), button:has-text("Take Survey"), button:has-text("Confirm"), button:has-text("Get Free Guide"), button:has-text("Get My Free Guide"), button:has-text("Get Guide"), button:has-text("Get Guide Now"), button:has-text("Get Cash Assistance"), button:has-text("Free Guide")', 'a:has-text("Continue"), a:has-text("Submit"), a:has-text("Next"), a:has-text("Agree & Submit"), a:has-text("AGREE & CONTINUE"), a:has-text("Tiếp tục"), a:has-text("Get Quote"), a:has-text("Agree"), a:has-text("Get Started"), a:has-text("See My Results"), a:has-text("Claim Now"), a:has-text("Proceed"), a:has-text("Complete"), a:has-text("Explore Plans"), a:has-text("Get My Reward"), a:has-text("Claim Reward"), a:has-text("Claim My Reward"), a:has-text("Get Reward"), a:has-text("Unlock Reward"), a:has-text("View Deals"), a:has-text("Continue to Deals"), a:has-text("View Offers"), a:has-text("See Offers"), a:has-text("Check Eligibility"), a:has-text("See Matches"), a:has-text("Sign Up"), a:has-text("Sign-Up"), a:has-text("Sign Up Now"), a:has-text("Register"), a:has-text("Register Now"), a:has-text("Join Now"), a:has-text("Enter Now"), a:has-text("Apply Now"), a:has-text("Start"), a:has-text("Take Survey"), a:has-text("Get Free Guide"), a:has-text("Get My Free Guide"), a:has-text("Get Guide"), a:has-text("Get Guide Now"), a:has-text("Get Cash Assistance"), a:has-text("Free Guide")', '[role="button"]:has-text("Continue"), [role="button"]:has-text("Submit"), [role="button"]:has-text("Next"), [role="button"]:has-text("Agree & Submit"), [role="button"]:has-text("Agree"), [role="button"]:has-text("Tiếp tục"), [role="button"]:has-text("Get Started"), [role="button"]:has-text("See My Results"), [role="button"]:has-text("Get My Reward"), [role="button"]:has-text("Claim Reward"), [role="button"]:has-text("Get Reward"), [role="button"]:has-text("Check Eligibility"), [role="button"]:has-text("Sign Up"), [role="button"]:has-text("Register"), [role="button"]:has-text("Join Now"), [role="button"]:has-text("Get Free Guide"), [role="button"]:has-text("Get Guide")', 'button:has-text("Yes"), button:has-text("No"), a:has-text("Yes"), a:has-text("No"), a:has-text("No Thanks"), button:has-text("CLAIM WHAT\'S MINE"), a:has-text("CLAIM WHAT\'S MINE")', 'a[id^="ct-creative-submit-"], button[id^="ct-creative-submit-"], .ct-creative-submit, [data-mock-secondary-offer-action]', 'button[id*="submit" i], button[id*="continue" i], button[id*="next" i], a[id*="submit" i], a[id*="continue" i], a[id*="next" i]', 'button[class*="submit" i], button[class*="continue" i], button[class*="next" i], a[class*="submit" i], a[class*="continue" i], a[class*="next" i]', 'div[class*="btn"]:has-text("Continue"), div[class*="button"]:has-text("Continue"), div[class*="btn"]:has-text("Next"), div[class*="button"]:has-text("Next"), span[class*="btn"]:has-text("Continue")', 'form button:not([type="reset"])'];
  for (const selector of candidateSelectors) {
    try {
      const candidates = await frame.locator(selector).all();
      for (const btn of candidates) {
        if (!(await btn.isVisible().catch(() => false))) continue;

        // Xác thực phần tử nút bấm: loại trừ tuyệt đối IFRAME, FORM hoặc container DIV lớn
        const validation = typeof btn.evaluate === 'function' ? await btn.evaluate((el, { maxViewports, legalNoiseSource } = {}) => {
          const tag = (el.tagName || 'BUTTON').toUpperCase();
          // Không ép nút đang xử lý request (disabled/loading) chạy lại: snapshot
          // SweepstakesAlerts cho thấy #newsletter-submit đổi thành "Submitting...".
          if (el.disabled || el.getAttribute?.('aria-disabled') === 'true' || el.getAttribute?.('aria-busy') === 'true') {
            return {
              valid: false,
              reason: 'disabled_or_busy'
            };
          }
          if (el.id === 'newsletter-submit' && /submitting/i.test(el.textContent || '')) {
            return {
              valid: false,
              reason: 'newsletter_submitting'
            };
          }
          if (['IFRAME', 'FRAME', 'FORM', 'BODY', 'HTML', 'MAIN', 'SECTION', 'ARTICLE'].includes(tag)) {
            return {
              valid: false,
              reason: 'container_tag'
            };
          }
          if (el.closest?.('form[role="search"], form:has(input[type="search"][name="q"])')) {
            return {
              valid: false,
              reason: 'site_search_form'
            };
          }

          // Bỏ qua các nút thuộc Offerwall Cards để nhường quyền xử lý cho handleOfferwallCards
          if (typeof el.closest === 'function' && el.closest('.offerwall-card, form[data-tf-element-role="offer"], .offerwall-card-wrap') || el.classList && typeof el.classList.contains === 'function' && el.classList.contains('offerwall-btn') || typeof el.getAttribute === 'function' && el.getAttribute('data-tf-element-role') === 'offer-btn') {
            return {
              valid: false,
              reason: 'offerwall'
            };
          }

          // Kiểm tra kích thước hình học nếu có: nút bấm không thể quá nhỏ hoặc quá khổng lồ (hỗ trợ nút full-width lên đến 1400px trên desktop)
          const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
          if (rect) {
            if (rect.width <= 4 || rect.height <= 4) return {
              valid: false,
              reason: 'zero_size'
            };
            if (rect.height > 250 || rect.width > 1400) return {
              valid: false,
              reason: 'too_large'
            };
            // Chỉ nhận nút ở đoạn đầu trang (màn hình đầu tiên), bỏ qua nút nằm sâu phía dưới.
            if (rect.top + (window.scrollY || 0) > (window.innerHeight || 0) * maxViewports) return {
              valid: false,
              reason: 'below_first_screen'
            };
          }
          const text = (el.innerText || el.value || el.textContent || '').trim().toLowerCase();
          const href = (el.getAttribute && typeof el.getAttribute === 'function' ? el.getAttribute('href') : '') || '';
          const idAndClass = `${el.id || ''} ${el.className || ''}`.toLowerCase();

          // 1. Kiểm tra từ khóa pháp lý / chân trang / link điều khoản
          // Thiếu nguồn regex (mock gọi evaluate không tham số) thì bỏ qua lọc pháp lý thay vì chặn mọi nút.
          const legalNoise = legalNoiseSource ? new RegExp(legalNoiseSource, 'i') : null;
          if (legalNoise && (legalNoise.test(text) || legalNoise.test(href) || legalNoise.test(idAndClass))) {
            return {
              valid: false,
              reason: 'legal_noise'
            };
          }

          // 1.1 Bỏ qua nút Reload / Tải lại của trang lỗi mạng Chrome (chrome-error://)
          if (/^reload$|^tải lại$/i.test(text) || el.id === 'reload-button' || el.classList && el.classList.contains('reload-button')) {
            return {
              valid: false,
              reason: 'browser_reload_error'
            };
          }

          // 2. Kiểm tra từ khóa menu / đăng nhập / tài khoản / liên hệ
          // Chú ý: Nút trong form hoặc div container, nút có type="submit" hoặc nút BUTTON CTA không bị coi là navNoise!
          const insideForm = typeof el.closest === 'function' ? el.closest('form, [role="form"], .form, .form-container, .survey-container, .quiz-container, .step-container, .card, div:has(input)') : null;
          const isSubmitRole = tag === 'BUTTON' || (el.type || '').toLowerCase() === 'submit';
          if (!insideForm && !isSubmitRole) {
            const navNoise = /^(sign\s*in|login|log\s*in|my\s*account)$|^(home|homepage)$|\bhome\s*page\b|\b(menu|main menu)\b|\b(cart|shopping cart)\b|\bportal\b|\b(contact\s*us|about\s*us|help & faq|faqs?)\b/i;
            if (navNoise.test(text) || navNoise.test(href) || navNoise.test(idAndClass)) {
              return {
                valid: false,
                reason: 'nav_noise'
              };
            }
          }
          if (typeof href === 'string' && (href.startsWith('mailto:') || href.startsWith('tel:'))) {
            return {
              valid: false,
              reason: 'contact_link'
            };
          }
          if (/cancel|back|previous|prev|quay lại|hủy|close|đóng/i.test(text)) {
            return {
              valid: false,
              reason: 'cancel_text'
            };
          }

          // 3. Bỏ qua nút nằm trong header / site-level footer / nav (nếu trang có thẻ)
          if (!insideForm) {
            const inSiteHeaderOrNav = typeof el.closest === 'function' ? el.closest('header, nav, #header, #nav, .site-header, .site-nav') : null;
            const inSiteFooter = typeof el.closest === 'function' ? el.closest('.site-footer, #footer, body > footer:not([class*="form"]):not([class*="step"]):not([class*="survey"]):not([class*="quiz"]):not([class*="modal"]):not([class*="card"])') : null;
            if (inSiteHeaderOrNav || inSiteFooter) {
              return {
                valid: false,
                reason: 'header_footer'
              };
            }
          }

          // 4. Kiểm tra vị trí hình học: nếu ở đỉnh trang (< 45px) trên trang dài mà không nằm trong form
          if (rect && rect.top < 45 && typeof document !== 'undefined' && (document.body?.scrollHeight || 0) > 500 && !insideForm) {
            return {
              valid: false,
              reason: 'top_header_zone'
            };
          }

          // 5. Nếu là thẻ A, loại bỏ nếu là inline text link trong đoạn văn bản disclaimer
          if (tag === 'A') {
            const isButtonStyled = idAndClass.includes('btn') || idAndClass.includes('button') || typeof el.getAttribute === 'function' && el.getAttribute('role') === 'button';
            if (!isButtonStyled) {
              const parentTextEl = typeof el.closest === 'function' ? el.closest('p, small, span') : null;
              if (parentTextEl && parentTextEl.textContent && parentTextEl.textContent.length > 60) {
                return {
                  valid: false,
                  reason: 'inline_disclaimer_link'
                };
              }
            }
          }
          if (tag === 'BUTTON') return {
            valid: true
          };
          if (tag === 'INPUT' && ['submit', 'button', 'image'].includes((el.type || '').toLowerCase())) return {
            valid: true
          };
          if (tag === 'A' || typeof el.getAttribute === 'function' && el.getAttribute('role') === 'button') return {
            valid: true
          };
          if (el.classList && (el.classList.contains('btn') || el.classList.contains('button') || /continue|next|submit|signup|register/i.test(el.className || ''))) return {
            valid: true
          };
          if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
            const style = window.getComputedStyle(el);
            if (style && style.cursor === 'pointer' && text.length > 0 && text.length < 60) return {
              valid: true
            };
          }
          return {
            valid: true
          };
        }, { maxViewports: SUBMIT_SCAN_VIEWPORTS, legalNoiseSource: SURVEY_LEGAL_NOISE_RE.source }).catch(() => ({
          valid: true
        })) : {
          valid: true
        };
        if (!validation.valid) continue;

        // Nút do website vô hiệu hóa có thể đang gửi dữ liệu hoặc đang thiếu
        // trường hợp lệ; không can thiệp vào trạng thái React của trang.
        const isEnabled = await btn.isEnabled().catch(() => false);
        if (!isEnabled) continue;
        return btn;
      }
    } catch {}
  }

  // 5. Fallback thông minh: Quét trực tiếp DOM trong frame để tìm nút Submit của form
  try {
    const foundByDom = await frame.evaluate(({ maxViewports, legalNoiseSource } = {}) => {
      const inFirstScreen = el => el.getBoundingClientRect().top + (window.scrollY || 0) <= (window.innerHeight || 0) * maxViewports;
      const isVisible = el => {
        if (!el || el.disabled) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 4 && rect.height > 4;
      };
      const isNoiseOrNav = el => {
        if (el.closest('form[role="search"], form:has(input[type="search"][name="q"])')) return true;
        const inForm = Boolean(el.closest('form') || el.form);
        const isSubmitTag = (el.tagName || '').toUpperCase() === 'BUTTON' || (el.type || '').toLowerCase() === 'submit';
        const text = (el.innerText || el.value || el.textContent || '').trim().toLowerCase();
        const href = (el.getAttribute ? el.getAttribute('href') : '') || '';
        const idAndClass = `${el.id || ''} ${el.className || ''}`.toLowerCase();
        const legalNoise = legalNoiseSource ? new RegExp(legalNoiseSource, 'i') : null;
        if (legalNoise && (legalNoise.test(text) || legalNoise.test(href) || legalNoise.test(idAndClass))) return true;
        if (!inForm && !isSubmitTag) {
          const navNoise = /^(sign\s*in|login|log\s*in|my\s*account)$|^(home|homepage)$|\bhome\s*page\b|\b(menu|main menu)\b|\b(cart|shopping cart)\b|\bportal\b|\b(contact\s*us|about\s*us|help & faq|faqs?)\b/i;
          if (navNoise.test(text) || navNoise.test(href) || navNoise.test(idAndClass)) return true;
        }
        if (href.startsWith('mailto:') || href.startsWith('tel:')) return true;
        if (/cancel|back|previous|prev|quay lại|hủy|close|đóng|skip|bỏ qua/i.test(text)) return true;
        const inHeader = el.closest('header, nav, #header, #nav, .site-header, .site-nav');
        if (inHeader && !inForm) return true;
        const rect = el.getBoundingClientRect();
        if (rect.top < 45 && document.body.scrollHeight > 500 && !inForm) return true;
        return false;
      };

      // 5.1 Tìm trong các form hoặc container div chứa input đang hiển thị
      // Tránh dính nút đáp án khảo sát alpha-intent (question-answer-button): trả lời câu hỏi
      // là hành vi riêng, không được coi là nút submit nếu trở thành đáp án.
      const forms = Array.from(document.querySelectorAll('form, [role="form"], .form, .form-container, .survey-container, div:has(input)')).filter(isVisible);
      for (const form of forms) {
        const sub = form.querySelector('button[type="submit"], input[type="submit"], button:not([type="button"]):not([type="reset"]):not(.question-answer-button):not([id^="answer-"])');
        if (sub && isVisible(sub) && inFirstScreen(sub) && !isNoiseOrNav(sub)) {
          sub.setAttribute('data-ux-submit-target', 'true');
          return true;
        }
        const anyBtn = Array.from(form.querySelectorAll('button:not([type="reset"]):not(.question-answer-button):not([id^="answer-"]), [role="button"], a.btn, a.button, input[type="button"]')).find(b => isVisible(b) && inFirstScreen(b) && !isNoiseOrNav(b));
        if (anyBtn) {
          anyBtn.setAttribute('data-ux-submit-target', 'true');
          return true;
        }
      }

      // 5.2 Tìm ngoài form: bất kỳ button nào có style hoặc text submit/continue/next
      const allButtons = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], a.btn, a.button, a.cta-button, .cta-button')).filter(b => isVisible(b) && inFirstScreen(b));
      for (const btn of allButtons) {
        if (isNoiseOrNav(btn)) continue;
        const text = (btn.innerText || btn.value || btn.textContent || '').trim().toLowerCase();
        if (/continue|submit|next|get quote|get started|see results|claim|proceed|tiếp tục|xác nhận|hoàn thành|agree|start|sign up|register|join|enter|survey/i.test(text)) {
          btn.setAttribute('data-ux-submit-target', 'true');
          return true;
        }
      }
      return false;
    }, { maxViewports: SUBMIT_SCAN_VIEWPORTS, legalNoiseSource: SURVEY_LEGAL_NOISE_RE.source }).catch(() => false);
    if (foundByDom) {
      const targetLoc = frame.locator('[data-ux-submit-target="true"]').first();
      if ((await targetLoc.count().catch(() => 0)) > 0) {
        return targetLoc;
      }
    }
  } catch {}
  return null;
}
export { findSubmitButton };
