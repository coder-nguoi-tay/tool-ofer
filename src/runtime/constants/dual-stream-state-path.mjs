import { appDataDirectory } from '../../config/paths.mjs';
import { join } from 'node:path';
const dualStreamStatePath = join(appDataDirectory, 'dual-stream-state.json');
export { dualStreamStatePath };
