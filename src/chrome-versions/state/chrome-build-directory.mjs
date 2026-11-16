import { baseDataDirectory } from '../../config/paths.mjs';
import { join } from 'node:path';
const chromeBuildDirectory = join(baseDataDirectory, 'chrome-builds');
export { chromeBuildDirectory };
