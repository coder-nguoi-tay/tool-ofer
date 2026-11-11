import { appDataDirectory } from '../../config/paths.mjs';
import { join } from 'node:path';
const leadStatsPath = join(appDataDirectory, 'lead-stats.json');
export { leadStatsPath };
