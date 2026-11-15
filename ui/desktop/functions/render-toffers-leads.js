/**
 * Render toffers leads.
 * @param {*} data data.
 * @return {void} Kết quả xử lý render toffers leads.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function renderToffersLeads(data) {
      if (typeof formatOfferDisplayName !== 'function') {
        window.formatOfferDisplayName = function formatOfferDisplayName(item) {
          if (!item) return '--';
          if (typeof item === 'string') return item.trim() || '--';
          const name = String(item.nameoff || '').trim();
          const offerId = item.offerid !== null && item.offerid !== undefined ? String(item.offerid).trim() : '';
          if (!name && !offerId) return '--';
          if (!offerId) return name || '--';
          if (!name) return `#${offerId}`;
          if (name.startsWith(`#${offerId}_`) || name.startsWith(`#${offerId} - `) || name.startsWith(`#${offerId} `)) {
            return name;
          }
          return `#${offerId}_${name}`;
        };
      }
      if (data.leadStats) {
        window.cachedLeadStats = Object.assign(window.cachedLeadStats || {}, data.leadStats);
      }
      const point = (data.point !== null && data.point !== undefined) ? data.point : '--';
      const results = data.results || [];

      // Cập nhật huy hiệu và stat pills trên toàn giao diện
      const pointText = `${point} pt`;
      const elHeaderPt = document.getElementById('tabLeadPointHeader');
      if (elHeaderPt) elHeaderPt.textContent = pointText;

      const elLbPt = document.getElementById('lbToffersPoint');
      if (elLbPt) elLbPt.textContent = String(point);

      const elSbPt = document.getElementById('sbToffersPoint');
      if (elSbPt) elSbPt.textContent = String(point);

      const elLbLd = document.getElementById('lbToffersLeadCount');
      if (elLbLd) elLbLd.textContent = String(results.length);

      const elRunPt = document.getElementById('runStatPoint');
      if (elRunPt) elRunPt.textContent = String(point);

      const elCardPt = document.getElementById('leadCardPoint');
      if (elCardPt) elCardPt.textContent = String(point);

      const elCardCnt = document.getElementById('leadCardCount');
      if (elCardCnt) elCardCnt.textContent = String(results.length);

      if (results.length > 0) {
        const first = results[0];
        const timeStr = first.timelead ? new Date(Number(first.timelead) * 1000).toLocaleString('vi-VN') : '--';
        const elLatest = document.getElementById('leadCardLatest');
        if (elLatest) elLatest.textContent = timeStr;

        const elLatestOff = document.getElementById('leadCardLatestOffer');
        if (elLatestOff) elLatestOff.textContent = formatOfferDisplayName(first);

        const elLatestIp = document.getElementById('leadCardLatestIp');
        if (elLatestIp) {
          elLatestIp.textContent = first.ip || '--';
          if (first.ip) {
            elLatestIp.style.cursor = 'pointer';
            elLatestIp.title = 'Nhấn để sao chép IP';
            elLatestIp.onclick = () => copyToClipboard(first.ip, `Đã sao chép IP: ${first.ip}`);
          }
        }
 
        const elLatestUsr = document.getElementById('leadCardLatestUser');
        if (elLatestUsr) elLatestUsr.textContent = `${first.fullname || ''} (${first.username || ''})`.trim() || '--';
      }

      const elLastUp = document.getElementById('leadLastUpdatedText');
      if (elLastUp) {
        const now = new Date();
        elLastUp.textContent = `Cập nhật: ${now.toLocaleTimeString('vi-VN')} (chu kỳ 10s)`;
      }

      filterToffersLeadsTable();
    }
