// Bản giải riêng của offer 2615, chép từ src/autofill/form-scope/select-page-form-frames.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
import { resolveActiveFormScope } from '../../../../form-scope/resolve-active-form-scope.mjs';

/**
 * Ưu tiên frame chứa form hoặc khảo sát đang làm việc để CTA ở trang cha không chiếm thao tác của iframe.
 * Riêng luồng Offer 2615: Nếu iframe khảo sát đang nạp, ưu tiên giữ chặt iframe con, không để trang cha submit sớm.
 * @param {object} page Tab Playwright cần xử lý.
 * @return {Promise<object[]>} Một frame có form đang hoạt động, hoặc danh sách frame khi không có form.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function selectPageFormFrames(page) {
  const frames = typeof page.frames === 'function' ? page.frames() : [page];

  // Offer 2615: Ưu tiên frame con đang nạp khảo sát để không bị CTA trang cha bấm sớm
  const childFrames = frames.filter(f => f !== (typeof page.mainFrame === 'function' ? page.mainFrame() : page));
  for (const child of childFrames) {
    const isSurveyLoading = await child.evaluate(() => {
      const isVisible = el => {
        if (!el || !el.isConnected) return false;
        const s = window.getComputedStyle ? window.getComputedStyle(el) : null;
        return !el.hidden && !el.hasAttribute('inert') && (!s || (s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0'));
      };
      const containers = Array.from(document.querySelectorAll('#questionText, .survey-container, .quiz-container, #AS_SURVEY, [class*="survey-card" i], [class*="quiz-card" i], .twy-campaigns')).filter(isVisible);
      const spinners = Array.from(document.querySelectorAll('.spinner, .loading, .loader, [aria-busy="true"], [class*="spinner" i], [class*="loading" i], [class*="load-spin" i]')).filter(isVisible);
      return containers.length > 0 || spinners.length > 0;
    }).catch(() => false);

    if (isSurveyLoading) {
      page._activeAutofillFrame = child;
      return [child];
    }
  }

  const work = await Promise.all(frames.map(async frame => ({ frame, scope: await resolveActiveFormScope(frame) })));
  const candidates = work.filter(item => item.scope?.active);
  candidates.sort((first, second) => Number(second.scope.modal) - Number(first.scope.modal) || Number(second.scope.focused) - Number(first.scope.focused) || Number(second.frame === page._activeAutofillFrame) - Number(first.frame === page._activeAutofillFrame) || second.scope.visibleFieldCount - first.scope.visibleFieldCount);
  const selected = work.find(item => item.frame === page._activeAutofillFrame && item.scope?.unavailable) || candidates[0] || work.find(item => item.frame === page._activeAutofillFrame && item.scope) || work.find(item => item.scope);
  page._activeAutofillFrame = selected?.frame || null;
  return selected ? [selected.frame] : frames;
}
