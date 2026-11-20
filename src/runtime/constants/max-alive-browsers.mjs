// The environment override may select 1..256 sessions. Invalid/unsafe values
// use the documented finite default; valid values above the hard ceiling clamp to it.
/** @var {number} Safe hard ceiling for the configured live-browser limit. */
const MAX_CONFIGURED_BROWSER_LIMIT = 256;
/** @var {number} Default live-browser limit when no valid override is configured. */
const DEFAULT_MAX_ALIVE_BROWSERS = 30;
const rawMaxAliveBrowsers = String(process.env.AUTOLEADPC_MAX_ALIVE ?? '').trim();
const parsedMaxAliveBrowsers = /^\d+$/.test(rawMaxAliveBrowsers) ? Number(rawMaxAliveBrowsers) : NaN;
const maxAliveBrowsers = Number.isSafeInteger(parsedMaxAliveBrowsers) && parsedMaxAliveBrowsers > 0
  ? Math.min(parsedMaxAliveBrowsers, MAX_CONFIGURED_BROWSER_LIMIT)
  : DEFAULT_MAX_ALIVE_BROWSERS;

/** @var {Set<object>} Browser launch slots reserved before asynchronous startup. */
const browserLaunchReservations = new Set();

/**
 * Normalize one requested browser count against the finite live-browser cap.
 * @param {string|number|undefined|null} value Raw requested count.
 * @param {number} [fallback=1] Count used when the field is absent.
 * @return {number} Valid integer count no greater than the configured live-browser cap.
 * @throws {Error} When a present value is empty, non-decimal, fractional, negative, unsafe, or above the cap.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function normalizeRequestedBrowserCount(value, fallback = 1) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const raw = typeof value === 'string' ? value.trim() : Number.isSafeInteger(value) ? String(value) : '';
  if (!/^\d+$/.test(raw)) {
    throw new Error('Số trình duyệt cần mở phải là số nguyên dương.');
  }
  const digits = raw.replace(/^0+(?=\d)/, '');
  const cap = String(maxAliveBrowsers);
  if (digits === '0') throw new Error('Số trình duyệt cần mở phải là số nguyên dương.');
  if (digits.length > cap.length || digits.length === cap.length && digits > cap) {
    throw new Error(`Chỉ được mở tối đa ${maxAliveBrowsers} phiên trình duyệt cùng lúc.`);
  }
  const count = Number(digits);
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('Số trình duyệt cần mở phải là số nguyên dương an toàn.');
  }
  return count;
}

/**
 * Reserve a live-browser slot before an asynchronous profile or browser launch.
 * @param {number} activeCount Number of live sessions already in activeBrowsers.
 * @return {object|null} Reservation token, or null when the cap is full.
 * @throws {Error} When activeCount is not a finite non-negative integer.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function reserveBrowserLaunchSlot(activeCount) {
  if (!Number.isSafeInteger(activeCount) || activeCount < 0) {
    throw new Error('Số phiên đang chạy không hợp lệ.');
  }
  if (activeCount + browserLaunchReservations.size >= maxAliveBrowsers) return null;
  const reservation = {};
  browserLaunchReservations.add(reservation);
  return reservation;
}

/**
 * Release a previously reserved browser launch slot.
 * @param {object|null|undefined} reservation Reservation token returned by reserveBrowserLaunchSlot.
 * @return {void} The token is removed from the shared reservation set.
 * @throws {never} This cleanup helper does not throw.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function releaseBrowserLaunchSlot(reservation) {
  if (reservation) browserLaunchReservations.delete(reservation);
}

export {
  DEFAULT_MAX_ALIVE_BROWSERS,
  MAX_CONFIGURED_BROWSER_LIMIT,
  browserLaunchReservations,
  maxAliveBrowsers,
  normalizeRequestedBrowserCount,
  releaseBrowserLaunchSlot,
  reserveBrowserLaunchSlot
};
