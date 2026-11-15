import { shouldPauseForLead } from '../should-pause-for-lead.mjs';
import { closePageBestEffort } from '../../proxy/actions/close-page-best-effort.mjs';

const preparations = new WeakMap();

/**
 * Dọn đúng các tab cũ của browser một lần, luôn giữ tab card và trạng thái lead của phiên.
 * @param {object} page Tab card phải giữ; không reset danh sách link đã mở.
 * @param {object} session Phiên sở hữu browser/IP.
 * @param {object} options Cờ chờ lead của lượt autofill.
 * @return {Promise<boolean>} True khi đã dọn xong và được phép mở offer con.
 * @throws {Error} Khi context không còn truy cập được; lỗi đóng tab riêng được bỏ qua để thử lại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export async function prepareSweepstakesCardPage(page, session, options) {
  const context = page.context();
  let state = preparations.get(context);
  if (!state || state.root.isClosed()) {
    state = { root: page, siblings: context.pages().filter(other => other !== page && !other.isClosed()), ready: false, pending: null };
    preparations.set(context, state);
  }
  if (state.root !== page || page.isClosed() || session.isClosed || shouldPauseForLead(session, options)) return false;
  if (state.ready) return true;
  if (!state.pending) state.pending = (async () => {
    session.mainPage = page;
    page._uxOriginTab = true;
    for (const sibling of state.siblings) {
      if (page.isClosed() || session.isClosed || shouldPauseForLead(session, options)) return false;
      if (sibling.isClosed()) continue;
      sibling._uxClosedByApp = 'dọn tab cũ trước màn card SweepstakesAlerts';
      await closePageBestEffort(sibling);
    }
    state.ready = !page.isClosed() && state.siblings.every(sibling => sibling.isClosed());
    return state.ready;
  })().finally(() => { state.pending = null; });
  return state.pending;
}
