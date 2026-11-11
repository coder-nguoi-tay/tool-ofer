window.receivePreferenceSaveResult = (statusCode) => {
      const saved = statusCode === 0;
      saveStatus.textContent = saved ? 'Đã lưu cấu hình trên máy này.' : `Không lưu được vào database (mã ${statusCode}).`;
      saveStatus.classList.toggle('error', !saved);
    };
