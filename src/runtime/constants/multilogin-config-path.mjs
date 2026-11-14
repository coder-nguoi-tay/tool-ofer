import { appDataDirectory } from '../../config/paths.mjs';
import { join } from 'node:path';

const multiloginConfigPath = join(appDataDirectory, 'multilogin-config.json');

export { multiloginConfigPath };
