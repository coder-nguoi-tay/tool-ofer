/**
 * Poll toffers overview: gửi datas + cookie giống desktop, cập nhật point và danh sách lead (bỏ qua khi tắt tự làm mới).
 * @param {boolean} isManual is manual.
 * @return {Promise<void>} Kết quả xử lý poll toffers overview.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function pollToffersOverview(isManual = false) {
      if (!isManual && document.getElementById('stLeadAuto')?.checked === false) return;
      const btn = document.getElementById('btnRefreshToffers');
      if (btn && isManual) {
        btn.disabled = true;
        btn.textContent = '⏳ Đang tải...';
      }
      const datas = (document.getElementById('stLeadDatas')?.value || '').trim() || '1504';
      // Ô cookie được điền từ localStorage khi khởi động; lần poll đầu có thể chạy trước nên đọc thẳng localStorage.
      const cookie = (document.getElementById('stLeadCookie')?.value || '').trim() || localStorage.getItem('toffers_custom_cookie') || '';
      try {
        const res = await fetch('/toffers/overview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ datas, cookie, forceRefresh: isManual }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.success) {
          const pt = (data.point !== null && data.point !== undefined) ? data.point : '--';
          const elTopPt = document.getElementById('topPointVal');
          if (elTopPt) elTopPt.textContent = `${pt} pt`;
          const elBigPt = document.getElementById('statTotalPointBig');
          if (elBigPt) elBigPt.textContent = `${pt} pt`;

          const results = data.results || [];
          const elLdCnt = document.getElementById('statToffersLeadsCount');
          if (elLdCnt) elLdCnt.textContent = `${results.length} leads`;
          const elUp = document.getElementById('textToffersUpdated');
          if (elUp) elUp.textContent = `Cập nhật: ${new Date().toLocaleTimeString('vi-VN')}`;

          miniStatsState.leads = results;
          if (data.leadStats) Object.assign(miniStatsState.leadStats, data.leadStats);
          miniStatsRenderLeads();
          if (isManual) showToast(`Đã làm mới: ${pt} point (${results.length} leads)`);
        } else if (isManual) {
          showToast('Lỗi toffers.top: ' + (data?.error || 'không lấy được dữ liệu'));
        }
      } catch (err) {
      } finally {
        if (btn && isManual) {
          btn.disabled = false;
          btn.textContent = '🔄 Làm mới Point';
        }
      }
    }
