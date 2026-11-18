/**
 * Nạp danh sách Quốc gia (Countries) và Network từ API toffers vào các ô chọn bộ lọc.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
async function loadToffersFilterOptions() {
  if (window.toffersFilterOptionsLoaded) return;

  try {
    const [cRes, nRes] = await Promise.allSettled([
      api('/toffers/countries'),
      api('/toffers/networks')
    ]);

    if (cRes.status === 'fulfilled' && cRes.value && cRes.value.countries) {
      const countrySelect = document.getElementById('toffersFilterCountry');
      if (countrySelect) {
        countrySelect.innerHTML = '<option value="">-- Tất cả Quốc gia (Country) --</option>';
        cRes.value.countries.forEach((c) => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = c.text;
          countrySelect.appendChild(opt);
        });
      }
    }

    if (nRes.status === 'fulfilled' && nRes.value && nRes.value.networks) {
      const netSelect = document.getElementById('toffersFilterNetwork');
      if (netSelect) {
        netSelect.innerHTML = '<option value="">-- Tất cả Network --</option>';
        nRes.value.networks.forEach((n) => {
          const opt = document.createElement('option');
          opt.value = n.id;
          opt.textContent = `Network ${n.text}`;
          netSelect.appendChild(opt);
        });
      }
    }

    window.toffersFilterOptionsLoaded = true;
  } catch (err) {
    console.warn('[Toffers] Lỗi tải danh mục bộ lọc:', err);
  }
}
