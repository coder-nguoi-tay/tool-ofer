import { appDataDirectory } from '../../config/paths.mjs';
import { join } from 'node:path';
const proxyUsageHistoryPath = join(appDataDirectory, 'proxy-usage.json');
export { proxyUsageHistoryPath };
