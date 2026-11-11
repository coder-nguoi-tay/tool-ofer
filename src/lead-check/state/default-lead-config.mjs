/**
 * Cấu hình mặc định cho việc kiểm tra lead qua API toffers.top.
 *
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
const DEFAULT_LEAD_CONFIG = {
  enabled: true,
  checkScreen: 4,
  apiUrl: 'https://toffers.top/partner/chat_leading/get_lead_datas',
  pointUrl: 'https://toffers.top/partner/get_data_not/get_current_point',
  cookie: 'qcodes_=7p0d1pg081d433i45giksp7k5fvm386o; qcodes_sound=1',
  datas: '1504',
  intervalSeconds: 30,
  maxAttempts: 2
};
export { DEFAULT_LEAD_CONFIG };
