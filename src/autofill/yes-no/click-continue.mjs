import { findSubmitButton } from '../find-submit-button.mjs';
import { humanClick } from '../human-click.mjs';

/**
 * Click Continue của bước Yes/No và chỉ tăng lượt khi input trình duyệt đã dispatch thành công.
 * @param {object} context Frame, tab, scope, bộ đếm lượt thử và callback log.
 * @return {Promise<object>} Quyết định giữ bước và số lần click đã thực hiện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
export async function clickYesNoContinue({ frame, page, scope, state, options }) {
  if (options.autoSubmit === false) return { handled: true, actions: 0 };
  if (state.attempts >= 2) {
    if (!state.notified) options.onLog?.({ type: 'survey_selection_unverified', detail: 'Đã thử No và Tiếp tục hai lần, giao diện chưa đổi; giữ bước chờ dữ liệu hoặc kiểm tra thủ công.' }, page);
    state.notified = true;
    return { handled: true, actions: 0 };
  }
  const button = await findSubmitButton(frame, scope);
  if (!button) return { handled: true, actions: 0 };
  const text = (await button.textContent().catch(() => '') || '').trim();
  if (!/^(continue|next|tiếp tục|tiếp theo)$/i.test(text)) return { handled: false, actions: 0 };

  // Tránh click trúng màn mờ loading hoặc lúc trang đang bận gửi AJAX
  const isBusy = await frame.evaluate(() => {
    const loaders = document.querySelectorAll('.Processing, .spinner, .loading-overlay, [aria-busy="true"]');
    return Array.from(loaders).some(loader => {
      const s = getComputedStyle(loader);
      const bounds = loader.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && bounds.width > 0 && bounds.height > 0;
    });
  }).catch(() => false);
  if (isBusy) {
    state.nextAt = Date.now() + 300;
    return { handled: true, actions: 0 };
  }

  if (!await humanClick(page, button)) return { handled: true, actions: 0 };
  state.attempts++;
  state.nextAt = Date.now() + 1500;
  options.onLog?.({ type: 'submit_clicked', detail: `Đã click Tiếp tục với ${state.no ? 'No' : 'Yes'} (${state.attempts}/2); chờ xác nhận chuyển bước.` }, page);
  return { handled: true, actions: 1 };
}
