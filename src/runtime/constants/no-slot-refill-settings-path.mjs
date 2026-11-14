import { appDataDirectory } from '../../config/paths.mjs';
import { join } from 'node:path';

const noSlotRefillSettingsPath = join(appDataDirectory, 'no-slot-refill-settings.json');
export { noSlotRefillSettingsPath };
