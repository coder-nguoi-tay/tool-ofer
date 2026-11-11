/**
 *  mods.
 * @param {*} e e.
 * @return {*} Kết quả xử lý  mods.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function _mods(e) { return (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0); }
