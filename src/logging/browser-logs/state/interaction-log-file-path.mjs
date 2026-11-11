import { interactionLogDirectory } from './interaction-log-directory.mjs';
import { join } from 'node:path';
const interactionLogFilePath = join(interactionLogDirectory, 'browser-logs.json');
export { interactionLogFilePath };
