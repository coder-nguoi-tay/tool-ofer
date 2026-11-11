import { homedir } from 'node:os';
import { join } from 'node:path';
const chromeBuildDirectory = join(homedir(), 'Library', 'Application Support', 'AutoLeadPC', 'chrome-builds');
export { chromeBuildDirectory };
