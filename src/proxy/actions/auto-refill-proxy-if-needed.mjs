import { add711IpWhitelist } from '../provider711.mjs';
import { applicationState } from '../../runtime/application-state.mjs';
import { ensure711Token } from '../provider711.mjs';
import { generate711SubuserProxies } from '../provider711.mjs';
import { importProxyLines } from './import-proxy-lines.mjs';
import { proxy711 } from '../provider711.mjs';
import { proxy711AutoRefill } from '../../runtime/constants/proxy711-auto-refill.mjs';
import { proxyQueue } from '../../runtime/constants/proxy-queue.mjs';
import { queueAutomaticRefill } from '../../refill/actions/queue-automatic-refill.mjs';
import { saveProxyQueue } from './save-proxy-queue.mjs';
import { tgNotify } from '../../../tgbot.mjs';

/**
 * Auto refill proxy if needed.
 * @return {Promise<void>} Kết quả xử lý auto refill proxy if needed.
 * @throws {Error} Khi dữ liệu không hợp lệ hoặc thao tác không thể hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function autoRefillProxyIfNeeded() {
  if (!proxy711AutoRefill.enabled || applicationState.proxy711AutoRefilling) return;
  if (proxyQueue.available.length > 0) return;
  applicationState.proxy711AutoRefilling = true;
  try {
    let proxyLines = [];
    if (proxy711.authMode === 'subuser' || proxy711.subuser && proxy711.subpass) {
      proxyLines = generate711SubuserProxies({
        subuser: proxy711.subuser,
        subpass: proxy711.subpass,
        count: proxy711AutoRefill.count,
        region: proxy711AutoRefill.region,
        sessTime: proxy711AutoRefill.sessTime,
        sessAuto: proxy711AutoRefill.sessAuto,
        gatewayHost: proxy711.gatewayHost,
        gatewayPort: proxy711.gatewayPort
      });
      const added = importProxyLines(proxyLines, 'http');
      if (added > 0) {
        await saveProxyQueue();
        console.log(`[Proxy711AutoRefill] Đã tự động tạo thêm ${added} proxy (User:Pass Auth).`);
        void tgNotify(`📦 Tự động tạo thêm <b>${added} proxy</b> từ 711proxy (User:Pass Auth, ${proxy711AutoRefill.region}). Hàng đợi: ${proxyQueue.available.length} proxy.`);
        queueAutomaticRefill();
      }
      return;
    }
    const genUrl = new URL('http://global.rotgbapi.trustsource.live:8089/gen');
    genUrl.searchParams.set('zone', 'custom');
    genUrl.searchParams.set('ptype', '1');
    genUrl.searchParams.set('region', proxy711AutoRefill.region);
    genUrl.searchParams.set('count', String(proxy711AutoRefill.count));
    genUrl.searchParams.set('proto', 'http');
    genUrl.searchParams.set('stype', 'text');
    genUrl.searchParams.set('split', '\r\n');
    genUrl.searchParams.set('sessType', 'sticky');
    genUrl.searchParams.set('sessTime', String(proxy711AutoRefill.sessTime));
    genUrl.searchParams.set('sessAuto', proxy711AutoRefill.sessAuto ? '1' : '0');
    let text;
    try {
      const res = await fetch(genUrl.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      text = await res.text();
      if (!text.trim() || text.includes('"code"') || text.toLowerCase().includes('whitelist')) throw new Error(text.slice(0, 200));
    } catch (e) {
      if (e.message.toLowerCase().includes('whitelist')) {
        const ipRes = await fetch('https://api.ipify.org?format=json').catch(() => null);
        const ip = ipRes ? (await ipRes.json().catch(() => ({}))).ip : null;
        const token = await ensure711Token();
        if (ip && token) {
          await add711IpWhitelist(ip, token);
          await new Promise(r => setTimeout(r, 2000));
          const retryRes = await fetch(genUrl.toString());
          if (!retryRes.ok) throw new Error(`HTTP ${retryRes.status}: ${await retryRes.text()}`);
          text = await retryRes.text();
          if (!text.trim() || text.includes('"code"')) throw new Error(text.slice(0, 200));
        } else {
          throw new Error(`IP ${ip || 'hiện tại'} chưa có trong whitelist 711proxy. Vui lòng đăng nhập lại 711proxy để tự động thêm whitelist.`);
        }
      } else {
        throw e;
      }
    }
    const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    proxyLines = rawLines.map(l => {
      if (/^https?:\/\//i.test(l)) return l;
      const at = l.lastIndexOf('@');
      if (at > 0) return `http://${l.slice(0, at)}@${l.slice(at + 1)}`;
      const parts = l.split(':');
      if (parts.length === 4) return `http://${encodeURIComponent(parts[2])}:${encodeURIComponent(parts[3])}@${parts[0]}:${parts[1]}`;
      return `http://${l}`;
    });
    const added = importProxyLines(proxyLines, 'http');
    if (added > 0) {
      await saveProxyQueue();
      console.log(`[Proxy711AutoRefill] Đã tự động nạp thêm ${added} proxy.`);
      void tgNotify(`📦 Tự động mua thêm <b>${added} proxy</b> từ 711proxy. Hàng đợi: ${proxyQueue.available.length} proxy.`);
      queueAutomaticRefill();
    }
  } catch (e) {
    console.log('[Proxy711AutoRefill] Lỗi tự động nạp proxy:', e.message);
    void tgNotify(`⚠️ Lỗi tự động mua proxy 711: ${e.message}`);
  } finally {
    applicationState.proxy711AutoRefilling = false;
  }
}
