const maxConcurrentProfiles = Math.min(30, Number(process.env.AUTOLEADPC_CONCURRENCY) || 30);
export { maxConcurrentProfiles };
