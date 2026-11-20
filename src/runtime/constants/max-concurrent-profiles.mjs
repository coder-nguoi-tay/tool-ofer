// Profile concurrency is also finite: invalid/unsafe values use 30 and valid
// overrides above the hard ceiling clamp to 256.
/** @var {number} Safe hard ceiling for profile workers. */
const MAX_CONFIGURED_PROFILE_CONCURRENCY = 256;
/** @var {number} Default number of concurrent profile workers. */
const DEFAULT_MAX_CONCURRENT_PROFILES = 30;
const rawMaxConcurrentProfiles = String(process.env.AUTOLEADPC_CONCURRENCY ?? '').trim();
const parsedMaxConcurrentProfiles = /^\d+$/.test(rawMaxConcurrentProfiles) ? Number(rawMaxConcurrentProfiles) : NaN;
const maxConcurrentProfiles = Number.isSafeInteger(parsedMaxConcurrentProfiles) && parsedMaxConcurrentProfiles > 0
  ? Math.min(parsedMaxConcurrentProfiles, MAX_CONFIGURED_PROFILE_CONCURRENCY)
  : DEFAULT_MAX_CONCURRENT_PROFILES;
export { maxConcurrentProfiles };
