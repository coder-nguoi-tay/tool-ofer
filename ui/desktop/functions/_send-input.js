/**
 *  send input.
 * @param {number} slot slot.
 * @param {*} data data.
 * @return {void} Kết quả xử lý  send input.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function _sendInput(slot, data) {
      fetch(`/screen/input/${slot}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).catch(() => { });
    }
