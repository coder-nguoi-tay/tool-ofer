import { appDataDirectory } from '../../config/paths.mjs';
import { join } from 'node:path';
const autofillRejectedPath = join(appDataDirectory, 'autofill-rejected.json');
export { autofillRejectedPath };
