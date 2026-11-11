import { appDataDirectory } from '../../config/paths.mjs';
import { join } from 'node:path';
const autofillUsedPath = join(appDataDirectory, 'autofill-used.json');
export { autofillUsedPath };
