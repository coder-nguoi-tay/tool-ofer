eqToggleBtn.addEventListener('click', () => {
      const isVisible = eqUsedBox.style.display !== 'none';
      eqUsedBox.style.display = isVisible ? 'none' : 'block';
      eqToggleBtn.textContent = isVisible ? 'Xem đã dùng' : 'Ẩn đã dùng';
    });
