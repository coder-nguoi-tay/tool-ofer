import { appDataDirectory } from '../../config/paths.mjs';
import { join } from 'node:path';
const lastLaunchSettingsPath = join(appDataDirectory, 'last-launch-settings.json');
export { lastLaunchSettingsPath };
