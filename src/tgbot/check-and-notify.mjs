import { appGet } from './app-get.mjs';
import { moduleState } from './state/module-state.mjs';
import { tgNotify } from './tg-notify.mjs';

/**
 * Check and notify.
 * @return {Promise<void>} Kết quả xử lý check and notify.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function checkAndNotify() {
  if (!moduleState.notifyChatId) return;
  try {
    const [state, pq] = await Promise.all([appGet('/state'), appGet('/proxy-queue')]);
    const active = state.activeCount ?? 0;
    const enabled = state.enabled && !state.stopRequested;
    const proxyAvail = pq.available ?? 0;
    const limitCount = state.limitRun?.count ?? 0;
    const limitMax = state.limitRun?.max ?? 0;

    // Cảnh báo số dư dung lượng 711Proxy thấp (< 1.0 GB)
    const p711 = state.bandwidth?.proxy711;
    if (p711?.ok && typeof p711.remainingGb === 'number') {
      if (p711.remainingGb <= 1.0 && !moduleState.low711BalanceNotified) {
        moduleState.low711BalanceNotified = true;
        await tgNotify(`⚠️ <b>Cảnh báo Dung lượng 711Proxy!</b>\n` + `Dung lượng còn lại: <b>${p711.remainingFormatted || p711.remainingGb.toFixed(2) + ' GB'}</b> (${p711.remainingPercent ?? 0}%)\n` + `Vui lòng nạp thêm data để tránh gián đoạn tiến trình.`, [[{
          text: '📶 Băng thông',
          cb: 'bw'
        }, {
          text: '📊 Status',
          cb: 'status'
        }]]);
      } else if (p711.remainingGb > 2.0) {
        moduleState.low711BalanceNotified = false;
      }
    }
    if (proxyAvail < 10 && proxyAvail > 0 && !moduleState.lowProxyNotified) {
      moduleState.lowProxyNotified = true;
      await tgNotify(`⚠️ <b>Proxy sắp hết!</b> Còn ${proxyAvail} proxy.`, [[{
        text: '🛒 Mua thêm ngay',
        cb: 'buy'
      }, {
        text: '📊 Status',
        cb: 'status'
      }]]);
    } else if (proxyAvail >= 15) moduleState.lowProxyNotified = false;
    if (proxyAvail === 0 && enabled && moduleState.lastActiveCount > 0) {
      await tgNotify(`🚫 <b>Hết proxy!</b> Luồng sẽ dừng khi xong session hiện tại.`, [[{
        text: '🛒 Mua proxy',
        cb: 'buy'
      }, {
        text: '🛑 Stop',
        cb: 'stop'
      }]]);
    }
    if (enabled && active === 0) {
      if (!moduleState.stuckSince) moduleState.stuckSince = Date.now();else if (Date.now() - moduleState.stuckSince > 10 * 60 * 1000) {
        await tgNotify(`⚠️ <b>Có thể bị stuck!</b> 0 luồng đang chạy trong 10+ phút.`, [[{
          text: '▶ Chạy lại',
          cb: 'run'
        }, {
          text: '🛑 Stop',
          cb: 'stop'
        }, {
          text: '📊 Status',
          cb: 'status'
        }]]);
        moduleState.stuckSince = Date.now() + 15 * 60 * 1000;
      }
    } else moduleState.stuckSince = null;
    if (limitMax > 0 && limitCount >= limitMax && moduleState.lastLimitRunCount < limitMax) {
      await tgNotify(`🎉 <b>Xong!</b> Đạt ${limitCount}/${limitMax} leads.`, [[{
        text: '▶ Chạy tiếp',
        cb: 'run'
      }, {
        text: '🔄 Reset',
        cb: 'reset'
      }, {
        text: '📊 Status',
        cb: 'status'
      }]]);
    }
    if (limitMax === 0 && limitCount > 0 && limitCount % 50 === 0 && limitCount !== moduleState.lastLimitRunCount) {
      const elapsed = Math.max(1, (Date.now() - moduleState.botStartTime) / 60000);
      const speed = Math.round((limitCount - moduleState.sessionLeadsAtBotStart) / elapsed * 60);
      await tgNotify(`✅ <b>${limitCount} leads</b> hoàn thành. ⚡ ~${speed}/giờ`, [[{
        text: '📊 Status',
        cb: 'status'
      }, {
        text: '⚡ Speed',
        cb: 'speed'
      }]]);
    }
    moduleState.lastActiveCount = active;
    moduleState.lastLimitRunCount = limitCount;
  } catch {}
}
export { checkAndNotify };
