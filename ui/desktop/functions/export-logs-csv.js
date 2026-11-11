/**
 * Export logs csv.
 * @return {void} Kết quả xử lý export logs csv.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function exportLogsCsv() {
      const url = currentSelectedOfferLogTab && currentSelectedOfferLogTab !== 'all'
        ? `/browser-logs/export-csv?offer=${encodeURIComponent(currentSelectedOfferLogTab)}`
        : '/browser-logs/export-csv';
      window.open(url, '_blank');
    }
