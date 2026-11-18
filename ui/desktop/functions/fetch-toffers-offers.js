/**
 * Gọi API lấy danh sách offers từ toffers.top dựa trên loại (working/new/live), bộ lọc và trang hiện tại.
 *
 * @param {boolean} [isManual=false] Có phải do người dùng bấm thủ công hay không.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
async function fetchToffersOffersData(isManual = false) {
  const btn = document.getElementById('btnRefreshToffersOffers');
  const tbody = document.getElementById('dgvToffersOffersBody');

  if (btn && isManual) {
    btn.disabled = true;
    btn.textContent = '⏳ Đang tải...';
  }

  // Đảm bảo options filter đã được tải
  void loadToffersFilterOptions();

  const type = window.currentToffersType || 'working';
  const start = (window.currentToffersPage || 0) * (window.currentToffersPageSize || 20);
  const length = window.currentToffersPageSize || 20;

  const query = document.getElementById('toffersFilterName')?.value?.trim() || '';
  const isNumeric = /^\d+$/.test(query);

  const filters = {
    offname: isNumeric ? '' : query,
    id: isNumeric ? query : '',
    idoffnet: '',
    agent: '',
    link: '',
    idnet: '',
    geo: document.getElementById('toffersFilterCountry')?.value || ''
  };

  const customCookie = document.getElementById('leadCustomCookie')?.value || '';

  try {
    const res = await api('/toffers/offers', {
      method: 'POST',
      body: JSON.stringify({
        type,
        start,
        length,
        cookie: customCookie,
        ...filters
      })
    });

    renderToffersOffers(res);
  } catch (err) {
    console.error('[Toffers] Lỗi tải danh sách offer:', err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#f87171;padding:25px;">⚠️ Lỗi tải dữ liệu: ${escHtml(err.message)}</td></tr>`;
    }
  } finally {
    if (btn && isManual) {
      btn.disabled = false;
      btn.textContent = '🔄 Làm mới';
    }
  }
}

/**
 * Chuyển đổi giữa các loại danh sách: working, new, live.
 * @param {string} type 'working' | 'new' | 'live'
 */
function switchOfferType(type) {
  if (window.currentToffersType === type) return;
  window.currentToffersType = type;
  window.currentToffersPage = 0;

  document.querySelectorAll('.toffers-type-btn').forEach((btn) => {
    btn.classList.remove('active');
    btn.style.background = '';
    btn.style.borderColor = '';
  });

  const activeBtn = document.getElementById(`btnToffersType${type.charAt(0).toUpperCase() + type.slice(1)}`);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }

  void fetchToffersOffersData(true);
}

/**
 * Tìm kiếm offer theo bộ lọc.
 */
function searchToffersOffers() {
  window.currentToffersPage = 0;
  void fetchToffersOffersData(true);
}

/**
 * Xóa bộ lọc và làm mới.
 */
function resetToffersFilters() {
  if (document.getElementById('toffersFilterName')) document.getElementById('toffersFilterName').value = '';
  if (document.getElementById('toffersFilterCountry')) document.getElementById('toffersFilterCountry').value = '';

  window.currentToffersPage = 0;
  void fetchToffersOffersData(true);
}

/**
 * Chuyển tới trang chỉ định.
 * @param {number} page Chỉ số trang (0-indexed).
 */
function goToToffersPage(page) {
  if (page < 0) return;
  window.currentToffersPage = page;
  void fetchToffersOffersData(true);
}

/**
 * Thay đổi số bản ghi trên mỗi trang.
 * @param {number|string} size Số lượng bản ghi.
 */
function changeToffersPageSize(size) {
  const parsed = parseInt(size, 10);
  if (!parsed || parsed <= 0) return;
  window.currentToffersPageSize = parsed;
  window.currentToffersPage = 0;
  void fetchToffersOffersData(true);
}
