downloadCsvButton.addEventListener('click', () => {
      if (!lastCheckCsv) return;
      // ﻿ (BOM) để Excel đọc đúng UTF-8 cho quốc gia/tổ chức có dấu.
      const blob = new Blob([`﻿${lastCheckCsv}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `proxy-check-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    });
