let latestToffersOverview = {
  success: false,
  point: null,
  results: [],
  check: null,
  error: null,
  updatedAt: null
};
/**
 * Cập nhật trạng thái latestToffersOverview và giữ liên kết export cho các nơi đang theo dõi.
 * @param {*} value Trạng thái mới.
 * @return {*} Trạng thái đã cập nhật.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function setLatestToffersOverview(value) {
  return latestToffersOverview = value;
}
export { latestToffersOverview, setLatestToffersOverview };
