import { appDataDirectory } from '../../../config/paths.mjs';
import { join } from 'node:path';
const interactionLogDirectory = join(appDataDirectory, 'logs');
export { interactionLogDirectory };
