/**
 * Save711 custom package gb.
 * @return {Promise<void>} Kết quả xử lý save711 custom package gb.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function save711CustomPackageGb() {
      const inp = document.getElementById('inp711CustomPackageGb');
      const val = parseFloat(inp?.value);
      if (!val || val <= 0 || isNaN(val)) {
        showWinAlert('Vui lòng nhập số GB hợp lệ (lớn hơn 0).');
        return;
      }
      await set711PackageGb(val);
    }
