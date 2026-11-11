pqToggleBtn.addEventListener('click', () => {
      const isVisible = pqUsedBox.style.display !== 'none';
      pqUsedBox.style.display = isVisible ? 'none' : 'block';
      pqToggleBtn.textContent = isVisible ? 'Xem danh sách đã dùng' : 'Ẩn danh sách đã dùng';
    });
