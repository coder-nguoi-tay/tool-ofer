// Bản giải riêng của offer 2615, chép từ src/autofill/form-scope/select-page-form-frames.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
import { resolveActiveFormScope } from '../../../../form-scope/resolve-active-form-scope.mjs';

/**
 * Ưu tiên frame chứa form đang làm việc để CTA ở trang cha không chiếm thao tác của iframe.
 * @param {object} page Tab Playwright cần xử lý.
 * @return {Promise<object[]>} Một frame có form đang hoạt động, hoặc danh sách frame khi không có form.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function selectPageFormFrames(page) {
  const frames = typeof page.frames === 'function' ? page.frames() : [page];
  const work = await Promise.all(frames.map(async frame => ({ frame, scope: await resolveActiveFormScope(frame) })));
  const candidates = work.filter(item => item.scope?.active);
  candidates.sort((first, second) => Number(second.scope.modal) - Number(first.scope.modal) || Number(second.scope.focused) - Number(first.scope.focused) || Number(second.frame === page._activeAutofillFrame) - Number(first.frame === page._activeAutofillFrame) || second.scope.visibleFieldCount - first.scope.visibleFieldCount);
  const selected = work.find(item => item.frame === page._activeAutofillFrame && item.scope?.unavailable) || candidates[0] || work.find(item => item.frame === page._activeAutofillFrame && item.scope) || work.find(item => item.scope);
  page._activeAutofillFrame = selected?.frame || null;
  return selected ? [selected.frame] : frames;
}
