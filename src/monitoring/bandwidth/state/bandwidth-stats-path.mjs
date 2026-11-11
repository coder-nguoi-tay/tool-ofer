import { appDataDirectory } from '../../../config/paths.mjs';
import { join } from 'node:path';
const bandwidthStatsPath = join(appDataDirectory, 'bandwidth-daily.json');
export { bandwidthStatsPath };
