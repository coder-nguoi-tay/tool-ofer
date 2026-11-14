import { appDataDirectory } from '../../config/paths.mjs';
import { join } from 'node:path';

const gologinConfigPath = join(appDataDirectory, 'gologin-config.json');

export { gologinConfigPath };
