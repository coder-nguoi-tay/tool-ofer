usageHistoryCsvButton.addEventListener('click', async () => {
      usageHistoryCsvButton.disabled = true;
      try {
        const response = await fetch('/proxy-usage.csv');
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error ?? 'Không tải được lịch sử proxy.');
        }
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = url;
        link.download = `proxy-usage-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        status.textContent = error.message;
      } finally {
        usageHistoryCsvButton.disabled = false;
      }
    });
