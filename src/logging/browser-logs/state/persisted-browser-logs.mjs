/** @type {Array<{id: string, slot: number, ip: string, version: string, startedAt: string, logs: Array<object>}>} */
let persistedBrowserLogs = [];
/**
 * Cập nhật trạng thái persistedBrowserLogs và giữ liên kết export cho các nơi đang theo dõi.
 * @param {*} value Trạng thái mới.
 * @return {*} Trạng thái đã cập nhật.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function setPersistedBrowserLogs(value) {
  return persistedBrowserLogs = value;
}
export { persistedBrowserLogs, setPersistedBrowserLogs };
