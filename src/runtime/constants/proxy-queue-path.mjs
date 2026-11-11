import { appDataDirectory } from '../../config/paths.mjs';
import { join } from 'node:path';
const proxyQueuePath = join(appDataDirectory, 'proxy-queue.json');
export { proxyQueuePath };
