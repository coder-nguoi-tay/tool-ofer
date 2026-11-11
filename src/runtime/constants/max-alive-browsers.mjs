const maxAliveBrowsers = Math.max(1, Math.min(30, Math.floor(Number(process.env.AUTOLEADPC_MAX_ALIVE) || 30)));
export { maxAliveBrowsers };
