import { fetchCurrentPoint } from './fetch-current-point.mjs';
import { fetchLeadDatas } from './fetch-lead-datas.mjs';

/**
 * Lấy đồng thời cả Số Point hiện tại và Danh sách Leads từ toffers.top.
 *
 * @param {object} [config={}] Cấu hình API.
 * @return {Promise<{success: boolean, point: number|null, results: object[], check: string|null, error: string|null}>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function fetchToffersOverview(config = {}) {
  const [pointRes, leadsRes] = await Promise.allSettled([fetchCurrentPoint(config), fetchLeadDatas(config)]);
  const point = pointRes.status === 'fulfilled' ? pointRes.value?.point : null;
  const leadData = leadsRes.status === 'fulfilled' ? leadsRes.value : null;
  const pointErr = pointRes.status === 'rejected' ? pointRes.reason?.message : null;
  const leadErr = leadsRes.status === 'rejected' ? leadsRes.reason?.message : null;
  return {
    success: Boolean(point !== null || leadData !== null),
    point,
    results: Array.isArray(leadData?.results) ? leadData.results : [],
    check: leadData?.check ?? null,
    error: pointErr && leadErr ? `${pointErr}; ${leadErr}` : pointErr || leadErr || null,
    updatedAt: new Date().toISOString()
  };
}
export { fetchToffersOverview };
