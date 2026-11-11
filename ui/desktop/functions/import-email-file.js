/**
 * Import email file.
 * @param {*} input input.
 * @return {Promise<void>} Kết quả xử lý import email file.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function importEmailFile(input) {
      const file = input.files[0];
      if (!file) return;
      input.value = '';
      const text = await file.text();
      document.getElementById('txtEmailList').value = text;
      await saveEmailList();
    }
