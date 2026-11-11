import { appDataDirectory } from '../../../config/paths.mjs';
import { join } from 'node:path';
const proxy711ConfigPath = join(appDataDirectory, '711proxy-config.json');
export { proxy711ConfigPath };
