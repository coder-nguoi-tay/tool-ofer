import { inspectInteractionReadiness } from '../browser/locators/inspect-interaction-readiness.mjs';
import { clickReadyControl } from '../browser/locators/click-ready-control.mjs';
/**
 * Xử lý màn "ow-addept" (offer-wall "Take the Deal" — iframe sdk.scrptk.com):
 * - Danh sách task `.unit-card` (10 task, data-creative-view-model JSON kèm headline/url).
 * - Bấm 1 task → `.info-panel` hiện CTA (#infoPanelButton) → click CTA → #skipButton để đi tiếp.
 * - Mỗi lượt quét chỉ 1 thao tác (throttle 2s), click thật qua bringToFront + locator/mouse.
 *
 * @param {object} page Trang Playwright hiện tại.
 * @param {object} frame Frame đang quét (có thể là iframe scrptk).
 * @param {object} [options={}] Tùy chọn (onLog).
 * @return {Promise<number>} Số thao tác đã thực hiện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function handleOfferwallTasks(page, frame, options = {}) {
  if (!frame || typeof frame.locator !== 'function') return 0;
  const now = Date.now();
  if (frame._uxOwHandledAt && now - frame._uxOwHandledAt < 2000) return 0;
  frame._uxOwHandledAt = now;
  const state = await frame.evaluate(() => {
    if (!document.querySelector('.unit-stack') && !document.querySelector('#infoPanel')) return null;
    const isVisible = el => {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const panel = document.querySelector('#infoPanel');
    const panelVisible = panel && isVisible(panel);
    const cta = document.querySelector('#infoPanelButton');
    if (panelVisible) {
      if (cta && isVisible(cta) && (cta.innerText || '').trim() && cta.getAttribute('data-ux-ow-cta') !== '1') {
        return {
          kind: 'cta',
          uid: 'infoPanelButton'
        };
      }
      const skip = document.querySelector('#skipButton') || document.querySelector('#closeButton');
      if (skip && isVisible(skip)) return {
        kind: 'skip',
        uid: skip.id
      };
      return null;
    }
    const cards = Array.from(document.querySelectorAll('.unit-card')).filter(c => isVisible(c) && !c.classList.contains('hidden') && c.getAttribute('data-ux-ow-clicked') !== '1');
    if (cards.length) {
      const pick = cards[Math.floor(Math.random() * cards.length)];
      try {
        const vm = JSON.parse(pick.getAttribute('data-creative-view-model') || '{}');
        return {
          kind: 'card',
          idx: pick.getAttribute('data-index') || String(cards.indexOf(pick)),
          headline: String(vm.headline || '').slice(0, 80)
        };
      } catch {
        return {
          kind: 'card',
          idx: pick.getAttribute('data-index') || String(cards.indexOf(pick)),
          headline: ''
        };
      }
    }
    return null;
  }).catch(() => null);
  if (!state) return 0;
  try {
    let sel = null;
    if (state.kind === 'card') sel = `.unit-card[data-index="${state.idx}"]`;else if (state.kind === 'cta') sel = '#infoPanelButton';else if (state.kind === 'skip') sel = `#${state.uid}`;
    const loc = frame.locator(sel).first();
    if ((await loc.count().catch(() => 0)) > 0) {
      const readiness = await loc.evaluate(inspectInteractionReadiness, frame._activeAutofillFormScope || null).catch(() => ({ ready:false }));
      const clicked = await clickReadyControl(loc, readiness);
      if (!clicked) { options.onLog?.({type:'survey_click_failed',detail:'Task chưa sẵn sàng để click; không đánh dấu đã chọn.'}); return 0; }
      if (state.kind === 'cta') await loc.evaluate(element => element.setAttribute('data-ux-ow-cta','1')).catch(() => {});
      if (state.kind === 'card') {
        const panelShown = await frame.locator('#infoPanel').waitFor({state:'visible',timeout:800}).then(()=>true).catch(()=>false);
        if (!panelShown) { options.onLog?.({type:'survey_selection_unverified',detail:'Click task chưa làm hiện info panel; không đánh dấu đã chọn.'}); return 0; }
        await frame.evaluate(i => {
          const el = document.querySelector(`.unit-card[data-index="${i}"]`);
          if (el) el.setAttribute('data-ux-ow-clicked', '1');
        }, state.idx).catch(() => {});
        options.onLog?.({
          type: 'ow_task_selected',
          detail: `[OW Task] Đã chọn task ngẫu nhiên: "${state.headline || state.idx}".`
        });
      } else if (state.kind === 'cta') {
        options.onLog?.({
          type: 'ow_task_cta',
          detail: '[OW Task] Đã bấm CTA task trong info panel.'
        });
      } else {
        options.onLog?.({
          type: 'ow_task_skip',
          detail: '[OW Task] Đã bấm Skip để sang bước tiếp.'
        });
      }
      return 1;
    }
  } catch {}
  return 0;
}
export { handleOfferwallTasks };
