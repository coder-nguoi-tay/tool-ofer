import { appDataDirectory } from '../../config/paths.mjs';
import { join } from 'node:path';
const deviceProfilesPath = join(appDataDirectory, 'device-profiles.json');
export { deviceProfilesPath };
