form.addEventListener('input', (event) => {
      if (savedFieldNames.includes(event.target.name)) saveStatus.textContent = 'Có thay đổi chưa lưu.';
    });
