import { appDataDirectory } from '../../../config/paths.mjs';
import { join } from 'node:path';
const emailQueuePath = join(appDataDirectory, 'email-queue.json');
export { emailQueuePath };
