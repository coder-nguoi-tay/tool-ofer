/**
 * Toggle screen view.
 * @return {void} Kết quả xử lý toggle screen view.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function toggleScreenView() {
      _screenViewActive = !_screenViewActive;
      const grid = document.getElementById('thumbnailGrid');
      const table = document.getElementById('runningTableWrap');
      const btn = document.getElementById('btnToggleScreenView');
      if (_screenViewActive) {
        grid.style.display = 'block';
        table.style.display = 'none';
        btn.textContent = '📋 Xem bảng';
        const runTab = document.querySelector('#mainTabHeaders .win-tab[data-tab="tabRunning"]');
        if (runTab) runTab.classList.add('active');
        _startThumbPolling();
      } else {
        grid.style.display = 'none';
        table.style.display = '';
        btn.textContent = '📺 Xem màn hình';
        document.querySelectorAll('#mainTabHeaders .win-tab').forEach(t => t.classList.remove('active'));
        const runTab = document.querySelector('#mainTabHeaders .win-tab[data-tab="tabRunning"]');
        if (runTab) runTab.classList.add('active');
        _stopThumbPolling();
      }
    }
