import { appDataDirectory } from '../../config/paths.mjs';
import { join } from 'node:path';
const adsPowerApiKeyPath = join(appDataDirectory, 'adspower-api-key.txt');
export { adsPowerApiKeyPath };
