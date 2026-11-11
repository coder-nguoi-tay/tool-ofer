/**
 * Toggle extra offer links.
 * @param {*} forceShow force show.
 * @return {void} Kết quả xử lý toggle extra offer links.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function toggleExtraOfferLinks(forceShow) {
      const el = document.getElementById('extraOfferLinks');
      const btn = document.getElementById('btnToggleExtraLinks');
      if (!el) return;
      const willShow = typeof forceShow === 'boolean' ? forceShow : (el.style.display === 'none');
      el.style.display = willShow ? 'block' : 'none';
      if (btn) {
        btn.innerHTML = willShow ? '▲ Thu gọn Link 2..4' : '➕ Thêm Link 2, 3, 4';
        btn.style.color = willShow ? '#94a3b8' : '#38bdf8';
      }
    }
