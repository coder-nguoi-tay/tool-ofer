aqToggleBtn.addEventListener('click', () => {
      const visible = aqUsedBox.style.display !== 'none';
      aqUsedBox.style.display = visible ? 'none' : 'block';
      aqToggleBtn.textContent = visible ? 'Xem đã dùng' : 'Ẩn đã dùng';
    });
