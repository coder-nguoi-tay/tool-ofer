import { APP_DATA_DIR } from './src/tunnel/state/app-data-dir.mjs';
import { mkdirSync } from 'node:fs';
export { getTailscaleFunnel } from './src/tunnel/get-tailscale-funnel.mjs';
export { startTunnel } from './src/tunnel/start-tunnel.mjs';
export { getTunnelUrl } from './src/tunnel/get-tunnel-url.mjs';
export { stopTunnel } from './src/tunnel/stop-tunnel.mjs';

mkdirSync(APP_DATA_DIR, { recursive: true });
