import { appDataDirectory } from '../../../config/paths.mjs';
import { join } from 'node:path';
const toffersConfigPath = join(appDataDirectory, 'toffers-config.json');
export { toffersConfigPath };
