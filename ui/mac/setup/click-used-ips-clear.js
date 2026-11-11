clearHistoryButton.addEventListener('click', async () => {
      if (!confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử IP/proxy đã dùng để dùng lại từ đầu?')) return;
      await send('/used-ips/clear', 'Đang xóa lịch sử proxy và IP đã dùng…');
      usedIpsBox.textContent = '';
    });
