import { homedir } from 'node:os';
import { join } from 'node:path';
const APP_DATA_DIR = join(homedir(), 'Library', 'Application Support', 'AutoLeadPC-2');
export { APP_DATA_DIR };
