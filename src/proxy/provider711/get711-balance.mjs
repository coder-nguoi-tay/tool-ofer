import { ensure711WapiToken } from './ensure711-wapi-token.mjs';
import { formatBytes } from '../../monitoring/bandwidth.mjs';
import { moduleState } from './state/module-state.mjs';
import { proxy711 } from './state/proxy711.mjs';
import { record711BalanceSample } from './record711-balance-sample.mjs';
import { saveProxy711Config } from './save-proxy711-config.mjs';

/**
 * Đọc số dư 711Proxy và cập nhật lượng dữ liệu đã tiêu hao.
 * @param {boolean} force Bỏ qua bộ nhớ đệm khi true.
 * @return {Promise<object>} Kết quả xử lý nghiệp vụ.
 * @throws {Error} Khi dữ liệu không hợp lệ hoặc thao tác không thể hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function get711Balance(force = false) {
  if (!force && moduleState.cached711Balance.ok && Date.now() - moduleState.cached711Balance.lastUpdated < 15_000) {
    return moduleState.cached711Balance;
  }

  // Số dư thật của tài khoản (khớp dashboard 711) nằm ở /wapi/balance/ với WAPI token.
  // /eapi/balance/ trả code 200 nhưng flow_balance = 0 với tài khoản web → không dùng, tránh báo "còn 0 GB".
  // WAPI token tự lấy lại bằng username/passwd đã lưu → không cần đăng nhập web lại.
  const token = await ensure711WapiToken();
  if (!token) {
    moduleState.cached711Balance = {
      ...moduleState.cached711Balance,
      ok: false,
      error: 'Chưa đăng nhập 711proxy.'
    };
    return moduleState.cached711Balance;
  }
  try {
    const balanceUrl = 'https://server.711proxy.com/wapi/balance/';
    const fetchBalance = async bearer => {
      const res = await fetch(balanceUrl, {
        headers: {
          Authorization: `Bearer ${bearer}`
        }
      });
      const body = await res.text();
      let json = null;
      try {
        json = JSON.parse(body);
      } catch {}
      return {
        res,
        body,
        json
      };
    };
    let {
      res,
      body: text,
      json: data
    } = await fetchBalance(token);
    if (res.status === 401 || res.status === 403 || data?.code === 41010) {
      proxy711.wapiToken = '';
      proxy711.wapiTokenExpiry = 0;
      const freshToken = await ensure711WapiToken();
      if (freshToken) ({
        res,
        body: text,
        json: data
      } = await fetchBalance(freshToken));
    }
    if (data && (data.code === 200 || data.code === 0) && typeof data.flow_balance === 'number') {
      const flowBytes = data.flow_balance;
      record711BalanceSample(flowBytes);
      const remainingGb = Number((flowBytes / 1024 ** 3).toFixed(3));
      let packageGb = Number(proxy711.packageGb) || 0;
      if (packageGb <= 0 || packageGb < remainingGb) {
        packageGb = Math.max(1, Math.ceil(remainingGb));
        proxy711.packageGb = packageGb;
        void saveProxy711Config();
      }
      const usedGb = Math.max(0, Number((packageGb - remainingGb).toFixed(3)));
      const usedPercent = packageGb > 0 ? Math.min(100, Number((usedGb / packageGb * 100).toFixed(1))) : 0;
      const remainingPercent = Number(Math.max(0, 100 - usedPercent).toFixed(1));
      moduleState.cached711Balance = {
        ok: true,
        flow_balance: flowBytes,
        flowFormatted: formatBytes(flowBytes),
        remainingGb,
        remainingFormatted: `${remainingGb.toFixed(2)} GB`,
        packageGb,
        packageFormatted: `${packageGb.toFixed(2)} GB`,
        usedGb,
        usedFormatted: `${usedGb.toFixed(2)} GB`,
        usedPercent,
        remainingPercent,
        lastUpdated: Date.now(),
        error: null
      };
      return moduleState.cached711Balance;
    }
    throw new Error(data?.message || data?.error || data?.msg || `Lỗi API 711: ${text.slice(0, 100)}`);
  } catch (err) {
    moduleState.cached711Balance = {
      ...moduleState.cached711Balance,
      ok: false,
      error: err.message
    };
    return moduleState.cached711Balance;
  }
}
export { get711Balance };
