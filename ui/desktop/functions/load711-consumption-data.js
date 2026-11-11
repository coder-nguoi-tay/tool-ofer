/**
 * Load711 consumption data.
 * @param {boolean} force force.
 * @return {Promise<void>} Kết quả xử lý load711 consumption data.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function load711ConsumptionData(force = false) {
      if (_is711ConsumptionLoading) return;
      const selRange = document.getElementById('sel711ChartRange');
      const rangeVal = selRange ? selRange.value : 'today';
      let days = 1;
      if (rangeVal === 'yesterday') days = 2;
      else if (rangeVal === '3days') days = 3;
      else if (rangeVal === '7days') days = 7;

      const cacheKey = `cached711Consume_${days}`;
      if (!force && window[cacheKey]) {
        render711ConsumptionTable(window[cacheKey]);
        return;
      }

      const lblLoading = document.getElementById('lbl711ChartLoading');
      if (lblLoading) lblLoading.style.display = 'inline';
      _is711ConsumptionLoading = true;

      try {
        const res = await api(`/711proxy/consumption?days=${days}`);
        if (!res || !res.ok) {
          const errMsg = res?.error || 'Không nhận được dữ liệu từ server 711proxy';
          const tbody = document.getElementById('bwTable711Body');
          if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:25px;color:#ef4444;">⚠️ Lỗi: ${escHtml(errMsg)}</td></tr>`;
          }
          return;
        }
        window[cacheKey] = res;
        window.cached711Consumption = res;
        render711ConsumptionTable(res);
      } catch (err) {
        const tbody = document.getElementById('bwTable711Body');
        if (tbody) {
          tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:25px;color:#ef4444;">⚠️ Lỗi kết nối: ${escHtml(err.message)}</td></tr>`;
        }
      } finally {
        _is711ConsumptionLoading = false;
        if (lblLoading) lblLoading.style.display = 'none';
      }
    }
