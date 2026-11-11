document.getElementById('btnTopReload').addEventListener('click', () => {
      pollState();
      pollResources();
      pollToffersOverview();
      showToast('Đã làm mới dữ liệu');
    });
