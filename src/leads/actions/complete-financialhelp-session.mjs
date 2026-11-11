import { canCompleteFinancialhelpSession } from './can-complete-financialhelp-session.mjs';
import { readProxyUsageHistory } from '../../proxy/actions/read-proxy-usage-history.mjs';
import { persistProxyUsageHistory } from '../../proxy/actions/persist-proxy-usage-history.mjs';

const completing = new WeakSet();

/**
 * Hoàn tất phiên FinancialHelpFinder khi mọi offer đã xong, là ngoại lệ đóng browser có lead được yêu cầu.
 * @param {object} session Phiên đang đứng tại trang thankyou chỉ định.
 * @param {Function} closeSession Luồng đóng/bù hiện có, nhận cờ hoàn tất được xác minh nội bộ.
 * @return {Promise<boolean>} True khi phiên đã được đóng do hoàn tất, không do lỗi trang.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function completeFinancialhelpSession(session, closeSession) {
  if (completing.has(session)) return false;
  completing.add(session);
  try {
    if (!await canCompleteFinancialhelpSession(session)) return false;
    if (session.proxyKey) {
      const history = await readProxyUsageHistory();
      if (history?.proxies?.[session.proxyKey]) {
        history.proxies[session.proxyKey] = { ...history.proxies[session.proxyKey], status: 'completed', reason: 'FinancialHelpFinder thankyou; không còn tab offer', completedAt: new Date().toISOString() };
        await persistProxyUsageHistory(history);
      }
    }
    if (!await canCompleteFinancialhelpSession(session)) return false;
    session.addBrowserLog?.({ type: 'thankyou_completed', detail: 'Đã tới FinancialHelpFinder thankyou và không còn tab làm offer; hoàn tất trình duyệt.' });
    await closeSession({ completedFinancialFlow: true });
    return session.isClosed === true;
  } catch { return false; }
  finally { completing.delete(session); }
}
