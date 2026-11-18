import { countLiveBrowsers, getLiveBrowsers } from '../../browser/count-live-browsers.mjs';
import { activeBrowsers } from '../../browser/sessions.mjs';
import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { dispatchOneTaskToAgent } from '../../agents/actions/dispatch-one-task-to-agent.mjs';
import { enqueueExclusively } from '../../runtime/actions/enqueue-exclusively.mjs';
import { launchRefillBrowsers } from './launch-refill-browsers.mjs';
import { maxAliveBrowsers } from '../../runtime/constants/max-alive-browsers.mjs';
import { normalizeUrl } from '../../proxy/configuration.mjs';
import { pickRefillOfferRoles } from './pick-refill-offer-roles.mjs';
import { offerStrategyState } from '../../runtime/constants/offer-strategy-state.mjs';
import { pruneStaleAgents } from '../../agents/actions/prune-stale-agents.mjs';
import { remoteAgents } from '../../runtime/constants/remote-agents.mjs';

/**
 * Xếp kiểm tra slot trống và bù bằng engine đã chọn ở lượt Start.
 *
 * @return {void} Không trả về giá trị.
 * @param {number} delayMs delay ms.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
export function queueAutomaticRefill(delayMs = 0) {
  if (autoRefill.stopRequested || autoRefill.noSlotRefill || !autoRefill.enabled || !autoRefill.settings) return;
  if (autoRefill.queued || autoRefill.isRefilling) {
    autoRefill.pendingRefillRequest = true;
    return;
  }
  const refillJob = {};
  autoRefill.refillJob = refillJob;
  autoRefill.queued = true;
  /**
   * Kiểm tra quyền điều phối của đúng lượt bù, kể cả sau khi chờ I/O.
   * @return {boolean} True khi job vẫn thuộc lượt chạy đang được cho phép.
   * @author ductv <ductv@getflycrm.com> @since 2026-11-18
   */
  const canRefill = () => autoRefill.refillJob === refillJob && !autoRefill.stopRequested
    && !autoRefill.noSlotRefill && autoRefill.enabled && Boolean(autoRefill.settings);
  void enqueueExclusively(async () => {
    try {
      if (!canRefill()) return;
      autoRefill.isRefilling = true;

      // Dọn các phiên đã đóng hoặc mất kết nối khỏi activeBrowsers
      for (const session of [...activeBrowsers]) {
        if (session.isObscuraProcessAlive?.() && !session.isClosed) continue;
        const isDead = session.isClosed ||
          (session.browser && typeof session.browser.isClosed === 'function' && session.browser.isClosed()) ||
          (session.browser && typeof session.browser.isConnected === 'function' && !session.browser.isConnected()) ||
          (session.isManagedProfile && session._cdpBrowser && !session._cdpBrowser.isConnected());
        if (isDead) {
          session.isClosed = true;
          activeBrowsers.delete(session);
        }
      }

      let liveBrowsers = getLiveBrowsers();

      const waitMs = autoRefill.sequential || liveBrowsers.length === 0 ? delayMs : 0;
      if (waitMs > 0) {
        autoRefill.message = `Chế độ tuần tự: chờ ${waitMs / 1000}s trước khi mở phiên tiếp theo…`;
        await new Promise(resolve => setTimeout(resolve, waitMs));
        if (!canRefill()) return;
        liveBrowsers = getLiveBrowsers();
      }
      const activeSettings = autoRefill.settings;
      const configuredOffers = [];
      if (Array.isArray(activeSettings.offerUrls) && activeSettings.offerUrls.length > 0) {
        configuredOffers.push(...activeSettings.offerUrls.map(u => normalizeUrl(u)).filter(Boolean));
      } else {
        const u1 = activeSettings.websiteUrl ? normalizeUrl(activeSettings.websiteUrl) : '';
        const u2 = activeSettings.websiteUrl2 ? normalizeUrl(activeSettings.websiteUrl2) : '';
        const u3 = activeSettings.websiteUrl3 ? normalizeUrl(activeSettings.websiteUrl3) : '';
        const u4 = activeSettings.websiteUrl4 ? normalizeUrl(activeSettings.websiteUrl4) : '';
        if (!u2 && u1 && /[\r\n,]/.test(activeSettings.websiteUrl)) {
          const parts = activeSettings.websiteUrl.split(/[\r\n,]+/).map(u => u.trim()).filter(Boolean);
          for (const p of parts) {
            try {
              const norm = normalizeUrl(p);
              if (!configuredOffers.includes(norm)) configuredOffers.push(norm);
            } catch {}
          }
        } else {
          if (u1) configuredOffers.push(u1);
          if (u2 && !configuredOffers.includes(u2)) configuredOffers.push(u2);
          if (u3 && !configuredOffers.includes(u3)) configuredOffers.push(u3);
          if (u4 && !configuredOffers.includes(u4)) configuredOffers.push(u4);
        }
      }
      const offerCount = Math.max(1, configuredOffers.length);
      const isMultiOffer = offerCount >= 2;
      const seqTarget = autoRefill.sequential ? (autoRefill.targetCount > 0 ? autoRefill.targetCount : (isMultiOffer ? 2 : 1)) : autoRefill.targetCount;
      const neededSlots = Math.min(seqTarget, maxAliveBrowsers) - liveBrowsers.length;
      if (neededSlots <= 0) return;
      autoRefill.message = autoRefill.sequential ? isMultiOffer ? `Chế độ tuần tự ${offerCount} luồng: đang mở phiên tiếp theo…` : 'Chế độ tuần tự: đang mở phiên tiếp theo…' : `Đang tìm proxy mới để bù ${neededSlots} slot trống…`;

      // Dispatch đến remote agents có enabled + còn slot + còn sống
      let remoteDispatched = 0;
      pruneStaleAgents();
      for (const [, agent] of remoteAgents) {
        if (remoteDispatched >= neededSlots) break;
        if (!agent.enabled || agent.freeSlots <= 0) continue;
        if (dispatchOneTaskToAgent(agent, activeSettings)) remoteDispatched++;
      }
      const localNeeded = neededSlots - remoteDispatched;
      if (localNeeded <= 0) {
        autoRefill.message = `Đã phân phát ${remoteDispatched} task cho agent từ xa.`;
        return;
      }
      let assignedStreamRoles = null;
      if (isMultiOffer) {
        // Trước đây vòng chọn không gán minOffer = k nên mọi slot bù đều thành offer 1.
        assignedStreamRoles = pickRefillOfferRoles(liveBrowsers, offerCount, localNeeded, k => offerStrategyState.get(k)?.mode !== 'skip');
        if (assignedStreamRoles.length === 0) {
          autoRefill.message = 'Mọi offer đang đặt Cách giải bỏ qua (skip); không bù slot.';
          return;
        }
      }
      const result = await launchRefillBrowsers(JSON.stringify({
        ...activeSettings,
        browserMode: activeSettings.browserMode || 'Chrome',
        offerUrls: configuredOffers,
        websiteUrl: configuredOffers[0] || activeSettings.websiteUrl,
        websiteUrl2: configuredOffers[1] || activeSettings.websiteUrl2,
        websiteUrl3: configuredOffers[2] || activeSettings.websiteUrl3,
        websiteUrl4: configuredOffers[3] || activeSettings.websiteUrl4,
        requestedCount: localNeeded
      }), {
        layoutTarget: seqTarget,
        assignedStreamRoles
      });
      if (!canRefill()) return;
      const currentAlive = countLiveBrowsers();
      autoRefill.message = currentAlive >= seqTarget ? `Đã bù đủ ${currentAlive}/${seqTarget} trình duyệt.` : result.warnings.at(-1) ?? `Hiện mở ${currentAlive}/${seqTarget}; không còn proxy phù hợp để bù.`;
    } catch (error) {
      if (canRefill()) autoRefill.message = `Tự bù gặp lỗi: ${error.message.split('\n')[0]}`;
    } finally {
      if (autoRefill.refillJob === refillJob) {
        autoRefill.refillJob = null;
        autoRefill.queued = false;
        autoRefill.isRefilling = false;
        if (autoRefill.pendingRefillRequest) {
          autoRefill.pendingRefillRequest = false;
          if (countLiveBrowsers() < autoRefill.targetCount && autoRefill.enabled && !autoRefill.stopRequested) {
            queueAutomaticRefill(1000);
          }
        }
      }
    }
  });
}
