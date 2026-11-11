export const replayState = { replay: null, events: [], index: 0, timer: null, requestVersion: 0 };
/**
 * Lấy thành phần của giao diện xem lại theo định danh cố định.
 * @param {string} id Định danh thành phần giao diện.
 * @return {HTMLElement|null} Thành phần tìm thấy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export const element = id => document.getElementById(id);
