import { DEFAULT_LEAD_CONFIG } from '../../../lead-check.mjs';
import { fetchToffersOverview } from '../../../lead-check.mjs';
import { latestToffersOverview } from './state/latest-toffers-overview.mjs';
import { saveToffersConfig } from './save-toffers-config.mjs';
import { setLatestToffersOverview } from './state/latest-toffers-overview.mjs';
import { updateLeadConfig } from '../../../lead-check.mjs';
import { observeLeadsAfterEmail } from '../../leads/actions/observe-leads-after-email.mjs';

/**
 * Cập nhật tổng quan điểm và lead, giữ kết quả gần nhất khi API lỗi.
 * @param {object|null} customConfig Thiết lập truy vấn thay thế.
 * @return {Promise<object>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function refreshToffersOverview(customConfig = null) {
  const config = {
    datas: customConfig?.datas || DEFAULT_LEAD_CONFIG.datas || '1504',
    cookie: customConfig?.cookie || DEFAULT_LEAD_CONFIG.cookie,
    pointUrl: customConfig?.pointUrl || DEFAULT_LEAD_CONFIG.pointUrl,
    apiUrl: customConfig?.apiUrl || DEFAULT_LEAD_CONFIG.apiUrl
  };
  if (customConfig?.cookie && customConfig.cookie !== DEFAULT_LEAD_CONFIG.cookie) {
    updateLeadConfig({
      cookie: customConfig.cookie
    });
    void saveToffersConfig(config);
  }
  if (customConfig?.datas && customConfig.datas !== DEFAULT_LEAD_CONFIG.datas) {
    updateLeadConfig({
      datas: customConfig.datas
    });
    void saveToffersConfig(config);
  }
  try {
    const overview = await fetchToffersOverview(config);
    if (overview.success) {
      const prevPoint = latestToffersOverview.point;
      const prevLeadCount = latestToffersOverview.results?.length || 0;
      // API point hoặc lead lỗi lẻ: giữ giá trị cũ thay vì ghi null/[] (trước đây point nhảy null ↔ 103 mỗi 10s).
      const merged = {
        ...overview,
        point: overview.pointOk === false ? latestToffersOverview.point : overview.point,
        results: overview.leadsOk === false ? latestToffersOverview.results || [] : overview.results
      };
      setLatestToffersOverview(merged);
      if (prevPoint !== merged.point || prevLeadCount !== merged.results.length) {
        console.log(`[Toffers] [10s Auto-check] Cập nhật: Point = ${merged.point} pt | Tổng số leads = ${merged.results.length}`);
      }
    } else {
      setLatestToffersOverview({
        ...overview,
        point: latestToffersOverview.point // Giữ điểm cũ nếu mạng chập chờn
      });
    }
    // Phiên không tick Check Lead: đối chiếu IP sau khi nhập email bằng chính kết quả poll này.
    try {
      // API lead lỗi → success false để theo dõi lead báo api_error, không coi danh sách rỗng là "chưa có lead".
      observeLeadsAfterEmail({ ...overview, success: overview.success && overview.leadsOk !== false });
    } catch (observeErr) {
      console.warn('[LeadObserve] Lỗi đối chiếu lead:', observeErr.message);
    }
    return latestToffersOverview;
  } catch (err) {
    setLatestToffersOverview({
      ...latestToffersOverview,
      error: err.message
    });
    return latestToffersOverview;
  }
}
export { refreshToffersOverview };
