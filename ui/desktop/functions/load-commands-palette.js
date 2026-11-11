/**
 * Load commands palette.
 * @return {Promise<void>} Kết quả xử lý load commands palette.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadCommandsPalette() {
      const data = await api('/pc/commands');
      allCommandsList = data.commands || [];
      renderCommandRows(allCommandsList);
    }
