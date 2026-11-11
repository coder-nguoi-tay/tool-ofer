/**
 * Filter commands.
 * @param {*} query query.
 * @return {void} Kết quả xử lý filter commands.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function filterCommands(query) {
      const q = String(query || '').toLowerCase();
      const filtered = allCommandsList.filter(c => c.raw.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
      renderCommandRows(filtered);
    }
