import { requestAdsPower } from './request-ads-power.mjs';

/**
 * Dọn các profile tạm AutoLeadPC mồ côi còn sót trên AdsPower để tránh chạm ngưỡng giới hạn profile.
 *
 * @param {string} apiKey Khóa Local API.
 * @param {Set<string>|string[]} [activeProfileIds] Danh sách ID profile đang hoạt động cần giữ lại.
 * @param {typeof fetch} [request] Hàm HTTP để thử nghiệm.
 * @return {Promise<number>} Số profile tạm đã được xóa.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function cleanupOrphanedAdsPowerProfiles(apiKey, activeProfileIds = new Set(), request = fetch, keepPoolSize = 0) {
  try {
    const data = await requestAdsPower(apiKey, '/api/v1/user/list?page=1&page_size=100', null, request);
    const list = Array.isArray(data?.list) ? data.list : [];
    const activeSet = activeProfileIds instanceof Set ? activeProfileIds : new Set(activeProfileIds || []);
    const isAutoLeadProfile = item => {
      if (!item) return false;
      if (typeof item.remark === 'string' && item.remark.includes('AutoLeadPC')) return true;
      if (typeof item.name === 'string') {
        if (item.name.includes('AutoLeadPC')) return true;
        if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(item.name)) return true;
        if (/^Slot\s+\d+/i.test(item.name)) return true;
      }
      return false;
    };
    const candidates = list.filter(item => isAutoLeadProfile(item) && !activeSet.has(item.user_id));
    const toDeleteCount = keepPoolSize > 0 ? Math.max(0, candidates.length - keepPoolSize) : candidates.length;
    const toDelete = candidates.slice(0, toDeleteCount).map(item => item.user_id);
    if (!toDelete.length) return 0;
    await requestAdsPower(apiKey, '/api/v2/browser-profile/delete', {
      profile_id: toDelete
    }, request);
    return toDelete.length;
  } catch (error) {
    console.warn(`[AdsPower] Không thể tự động dọn profile tạm mồ côi: ${error.message}`);
    return 0;
  }
}
export { cleanupOrphanedAdsPowerProfiles };
