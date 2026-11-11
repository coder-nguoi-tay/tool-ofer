import { appDataDirectory } from '../../config/paths.mjs';
import { join } from 'node:path';
const autoRefillSettingsPath = join(appDataDirectory, 'autorefill-settings.json');
export { autoRefillSettingsPath };
