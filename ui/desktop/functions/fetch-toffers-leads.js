/**
 * Fetch toffers leads.
 * @param {boolean} isManual is manual.
 * @return {Promise<void>} Kết quả xử lý fetch toffers leads.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function fetchToffersLeads(isManual = false) {
      const btn = document.getElementById('btnRefreshToffersLeads');
      if (btn && isManual) {
        btn.disabled = true;
        btn.textContent = '⏳ Đang tải...';
      }

      const datas = document.getElementById('leadDatasParam')?.value || '1504';
      const cookie = document.getElementById('leadCustomCookie')?.value || '';

      try {
        const res = await api('/toffers/overview', {
          method: 'POST',
          body: JSON.stringify({ datas, cookie, forceRefresh: isManual })
        });

        if (res && res.success) {
          toffersLeadsData = res.results || [];
          if (res.leadStats) {
            window.cachedLeadStats = Object.assign(window.cachedLeadStats || {}, res.leadStats);
          }
          renderToffersLeads(res);
          resetLeadCountdown();
        } else {
          console.warn('[Toffers] Không lấy được dữ liệu:', res?.error);
          if (isManual && res?.error) {
            showWinAlert('Lỗi toffers.top: ' + res.error);
          }
        }
      } catch (err) {
        console.error('[Toffers] Lỗi gọi API:', err);
      } finally {
        if (btn && isManual) {
          btn.disabled = false;
          btn.textContent = '🔄 Làm mới';
        }
      }
    }
