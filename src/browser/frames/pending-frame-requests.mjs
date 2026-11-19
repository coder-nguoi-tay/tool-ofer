import { isHeavyAdOrTrackerUrl } from '../data-saver/is-heavy-ad-or-tracker-url.mjs';

const observations = new WeakMap();
const documentResources = new Set(['document', 'subdocument', 'fetch', 'xhr', 'script']);

/**
 * Lấy tài liệu sở hữu request kể cả khi Playwright công bố popup muộn.
 * @param {object} request Request Playwright.
 * @return {object|null} Frame đã gắn vào một tab hoặc null.
 * @throws {never} Bỏ qua quan hệ chưa được trình duyệt công bố.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
function requestFrame(request) {
  try { return request.frame(); } catch { return null; }
}

/**
 * Theo dõi mạng tạo nội dung theo tài liệu, chỉ giữ request đang tải và các endpoint dữ liệu gần nhất.
 * @param {object} target BrowserContext hoặc tab đang được quản lý.
 * @return {void} Đăng ký một lần trên context.
 * @throws {never} Bỏ qua target chưa có API sự kiện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export function attachFrameRequestTracking(target) {
  const source = target?.context?.() || target;
  if (!source?.on || observations.has(source)) return;
  const pending = new Map();
  const documents = new WeakMap();
  const navigations = new WeakMap();
  const watchedPages = new WeakSet();
  observations.set(source, { pending, documents });
  let sequence = 0;

  /**
   * Gỡ request của tài liệu cũ sau khi navigation mới thực sự commit.
   * @param {object} page Tab Playwright quan sát được từ context.
   * @return {void} Gắn các sự kiện vòng đời vào tab.
   * @throws {never} Các tab fixture không có API sự kiện được bỏ qua.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-19
   */
  const watchPage = page => {
    if (watchedPages.has(page)) return;
    watchedPages.add(page);
    page.on?.('request', request => {
      const entry = pending.get(request);
      if (entry) entry.page = page;
    });
    page.on?.('framenavigated', frame => {
      const navigation = navigations.get(frame);
      if (!navigation || navigation.url.split('#')[0] !== frame.url().split('#')[0]) return;
      navigations.delete(frame);
      documents.delete(frame);
      for (const [request, entry] of pending) {
        if (entry.sequence < navigation.sequence && requestFrame(request) === frame) pending.delete(request);
      }
    });
    page.on?.('framedetached', frame => {
      documents.delete(frame);
      for (const request of pending.keys()) if (requestFrame(request) === frame) pending.delete(request);
    });
    page.on?.('close', () => {
      for (const [request, entry] of pending) {
        if (entry.page === page || requestFrame(request)?.page?.() === page) pending.delete(request);
      }
    });
  };
  source.on('page', watchPage);
  const initialPages = source.pages?.();
  if (Array.isArray(initialPages)) initialPages.forEach(watchPage);
  else if (initialPages) Promise.resolve(initialPages).then(pages => pages.forEach(watchPage)).catch(() => {});
  source.on('request', request => {
    const resource = request.resourceType?.();
    if (!documentResources.has(resource) || request.serviceWorker?.() || isHeavyAdOrTrackerUrl(request.url?.())) return;
    const owner = requestFrame(request);
    const entry = { sequence: ++sequence, page: owner?.page?.() };
    if (resource === 'xhr' || resource === 'fetch') {
      try {
        const url = new URL(request.url());
        entry.endpoint = (request.method?.() || 'GET') + ' ' + url.origin + url.pathname;
      } catch {}
    }
    pending.set(request, entry);
    if (owner && request.isNavigationRequest?.()) navigations.set(owner, { sequence, url: request.url() });
  });

  /**
   * Nhả request và tính lại khoảng chờ sau lượt tải nội dung mới của tài liệu.
   * @param {object} request Request vừa hoàn tất, thất bại hoặc bị hủy.
   * @return {void} Cùng một endpoint polling chỉ khởi động khoảng chờ dài một lần.
   * @throws {never} Frame đã tách được bỏ qua.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-19
   */
  const settle = request => {
    const entry = pending.get(request);
    pending.delete(request);
    if (!entry) return;
    const owner = requestFrame(request);
    if (!owner || owner.isDetached?.()) return;
    let document = documents.get(owner);
    if (!document) {
      document = { endpoints: new Set(), settledAt: 0 };
      documents.set(owner, document);
    }
    if (entry.endpoint) {
      if (document.endpoints.has(entry.endpoint)) return;
      if (document.endpoints.size >= 64) document.endpoints.delete(document.endpoints.values().next().value);
      document.endpoints.add(entry.endpoint);
    }
    document.settledAt = Date.now();
  };
  source.on('requestfinished', settle);
  source.on('requestfailed', settle);
  source.on('close', () => pending.clear());
}

/**
 * Kiểm tra request thuộc đúng tab/frame trước thao tác làm mất tài liệu đang tải.
 * @param {object} page Tab đang được xét.
 * @param {object} [frame] Tài liệu đích; mặc định xét toàn bộ tab.
 * @param {boolean} [newContentOnly] Chỉ xét request sẽ cấp lại khoảng chờ dài khi hoàn tất.
 * @return {boolean} True khi tài liệu có request liên quan.
 * @throws {never} Không gán request chưa rõ tab cho các tab khác trong context.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export function hasPendingFrameRequests(page, frame, newContentOnly = false) {
  const source = page?.context?.() || page;
  const state = observations.get(source);
  if (!state) return false;
  for (const [request, entry] of state.pending) {
    const owner = requestFrame(request);
    if (!owner) {
      if (entry.page === page) return true;
      continue;
    }
    if (owner.isDetached?.() || (frame ? frame !== owner : source !== page && owner.page?.() !== page)) continue;
    if (!newContentOnly || !entry.endpoint || !state.documents.get(owner)?.endpoints.has(entry.endpoint)) return true;
  }
  return false;
}

/**
 * Lấy thời điểm kết thúc request nội dung mới gần nhất để chờ DOM render.
 * @param {object} page Tab sở hữu tài liệu.
 * @param {object} frame Frame cần xét.
 * @return {number} Mốc gần nhất hoặc 0 khi chưa quan sát.
 * @throws {never} Có thể đọc trước khi đăng ký theo dõi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export function lastFrameRequestSettledAt(page, frame) {
  return observations.get(page?.context?.() || page)?.documents.get(frame)?.settledAt ?? 0;
}
