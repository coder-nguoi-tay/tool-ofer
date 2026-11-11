import { appDataDirectory } from '../../../config/paths.mjs';
import { join } from 'node:path';
const emailAutoRefillConfigPath = join(appDataDirectory, 'email-autorefill.json');
export { emailAutoRefillConfigPath };
