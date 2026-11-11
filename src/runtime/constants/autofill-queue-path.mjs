import { appDataDirectory } from '../../config/paths.mjs';
import { join } from 'node:path';
const autofillQueuePath = join(appDataDirectory, 'autofill-queue.json');
export { autofillQueuePath };
