import { APP_DATA_DIR } from './app-data-dir.mjs';
import { join } from 'node:path';
const TUNNEL_URL_FILE = join(APP_DATA_DIR, 'tunnel-url.txt');
export { TUNNEL_URL_FILE };
