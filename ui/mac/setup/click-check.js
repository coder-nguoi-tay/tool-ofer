checkButton.addEventListener('click', async () => {
      const result = await send('/check', 'Đang kiểm tra toàn bộ danh sách proxy…', { requestedCount: '' });
      lastCheckCsv = result?.csv ?? '';
      downloadCsvButton.hidden = !lastCheckCsv;
    });
