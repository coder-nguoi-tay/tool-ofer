import { resolveActiveFormScope } from './resolve-active-form-scope.mjs';
import { inspectFormFrameOwner } from '../../browser/frames/inspect-form-frame-owner.mjs';
import { detectOfferContentInPage } from '../../leads/actions/detect-offer-content-in-page.mjs';
import { isSecondaryOfferTab } from '../../leads/actions/is-secondary-offer-tab.mjs';
import { readEvidenceWithTimeout } from '../../logging/recorder/read-evidence-with-timeout.mjs';

/**
 * Đọc dấu hiệu form/câu hỏi của một tài liệu khi chưa có form scope.
 * @param {object} frame Tài liệu Playwright cần nhận diện.
 * @param {boolean} embedded Có cần phân biệt iframe trắng với tài liệu đã hiển thị hay không.
 * @param {boolean} [remainingIframeWork] Kiểm tra công việc còn lại ở iframe của tab phụ.
 * @return {Promise<object|null>} Bằng chứng tích cực cùng trạng thái tải, hoặc null khi chưa xác minh.
 * @throws {never} Lỗi đọc được xem là trạng thái chưa xác minh.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function readFormContent(frame, embedded, remainingIframeWork = false) {
  return readEvidenceWithTimeout(frame, 'form-content', () => frame.evaluate(detectOfferContentInPage, { subTab: true, frameStatus: embedded, remainingIframeWork })).catch(() => null);
}

/**
 * Chọn form trong vùng nội dung. Tab phụ chỉ chọn iframe còn trường hoặc câu hỏi.
 * @param {object} page Tab Playwright cần xử lý.
 * @param {Function} [isSurveyLoading] Dấu hiệu chờ riêng của khảo sát trong một frame hợp lệ.
 * @return {Promise<object[]>} Frame có thể quét, hoặc mảng rỗng để đợi lượt kiểm tra kế tiếp.
 * @throws {Error} Khi tab không còn cung cấp danh sách frame.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export async function selectPageFormFrames(page, isSurveyLoading) {
  const frames = typeof page.frames === 'function' ? page.frames() : [page];
  const main = page.mainFrame?.() || frames[0];
  const iframeOnly = isSecondaryOfferTab(page);
  const owners = await Promise.all(frames.filter(frame => frame !== main).map(async frame => {
    const state = await inspectFormFrameOwner(frame, { iframeOnly });
    const content = iframeOnly && state === 'eligible' ? await readFormContent(frame, true, true) : null;
    return { frame, state, content };
  }));
  const children = owners.filter(({ state, content }) => state === 'eligible' && (!iframeOnly ||
    content && !content.loading && !content.challenge && (content.hasForm || content.hasChoices || content.hasQuestion))).map(owner => owner.frame);
  if (isSurveyLoading && !iframeOnly) {
    for (const child of children) {
      if (await isSurveyLoading(child)) {
        page._activeAutofillFrame = child;
        page._autofillWaitingForFormFrame = false;
        return [child];
      }
    }
  }
  const inspectable = main && !iframeOnly ? [main, ...children] : children;
  const scopes = await Promise.all(inspectable.map(async frame => ({ frame, scope: await resolveActiveFormScope(frame) })));
  const hasContentFrame = owners.some(owner => owner.state !== 'excluded');
  const work = scopes.filter(({ frame, scope }) => frame !== main || !hasContentFrame || scope?.visibleFieldCount > 0);
  const candidates = work.filter(item => item.scope?.active);
  candidates.sort((first, second) => Number(second.scope.modal) - Number(first.scope.modal) || Number(second.scope.focused) - Number(first.scope.focused) || Number(second.frame === page._activeAutofillFrame) - Number(first.frame === page._activeAutofillFrame) || second.scope.visibleFieldCount - first.scope.visibleFieldCount);
  const selected = work.find(item => item.frame === page._activeAutofillFrame && item.scope?.unavailable) || candidates[0] || work.find(item => item.frame === page._activeAutofillFrame && item.scope) || work.find(item => item.scope);
  let frame = selected?.frame || (iframeOnly ? children[0] : null) || null;
  let pendingFrame = !main || owners.some(({ state, content }) => state === 'unknown' ||
    iframeOnly && state === 'eligible' && (!content || content.loading || content.challenge || !content.hasRenderedContent));
  if (!frame && !iframeOnly) {
    for (const candidate of hasContentFrame ? children : inspectable) {
      const embedded = candidate !== main;
      const content = await readFormContent(candidate, embedded);
      if (!content || content.loading || content.challenge || (embedded && (!content.hasRenderedContent || /^(chrome-error:|about:neterror)/.test(candidate.url())))) pendingFrame = true;
      if (content?.hasChoices || content?.hasForm || content?.hasQuestion) {
        frame = candidate;
        break;
      }
    }
    if (!frame && main && hasContentFrame && !pendingFrame) {
      const parentContent = await readFormContent(main, false);
      pendingFrame = !parentContent || parentContent.loading || parentContent.challenge;
      if (parentContent?.hasForm || parentContent?.hasChoices || parentContent?.hasQuestion) frame = main;
    }
  }
  page._activeAutofillFrame = selected?.frame || (frame !== main ? frame : null);
  page._autofillWaitingForFormFrame = !frame && pendingFrame;
  return frame ? [frame] : [];
}

/**
 * Giới hạn một lượt đọc hoặc thao tác AI vào frame hiện tại, kể cả khi iframe đổi vùng hoặc vừa xuất hiện.
 * @param {object} page Tab Playwright, hoặc tài liệu độc lập được phân tích.
 * @return {Promise<object[]>} Tối đa một tài liệu đủ điều kiện. Mảng rỗng yêu cầu chờ quét lại.
 * @throws {Error} Khi tab không còn cung cấp danh sách frame.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export async function getAiFormFrames(page) {
  const selected = page._activeAutofillFrame;
  const main = page.mainFrame?.() || page.frames?.()[0] || page;
  if (isSecondaryOfferTab(page) || page._autofillWaitingForFormFrame || (page.mainFrame && (!selected || (page.frames().length > 1 && selected === main)))) {
    return selectPageFormFrames(page);
  }
  if (selected && selected !== main) {
    if (await inspectFormFrameOwner(selected) !== 'eligible') return [];
    if (!selected._activeAutofillFormScope && page.mainFrame) {
      const scope = await resolveActiveFormScope(selected);
      if (scope?.active) return [selected];
      const content = await readFormContent(selected, true);
      if (!content?.hasChoices && !content?.hasForm && !content?.hasQuestion) return [];
    }
  }
  return [selected || main];
}
