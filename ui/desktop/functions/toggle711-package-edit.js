/**
 * Toggle711 package edit.
 * @param {*} forceShow force show.
 * @return {void} Kết quả xử lý toggle711 package edit.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function toggle711PackageEdit(forceShow = null) {
      const drawer = document.getElementById('bw711PackageEditDrawer');
      if (!drawer) return;
      if (typeof forceShow === 'boolean') {
        drawer.style.display = forceShow ? 'block' : 'none';
      } else {
        drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
      }
    }
